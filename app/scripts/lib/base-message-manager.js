import * as ethUtil from '@ethereumjs/util';
import { ObservableStore } from '@metamask/obs-store';
import { providerErrors } from '@metamask/rpc-errors';
import EventEmitter from 'events';
import log from 'loglevel';

// Hex for whole bytes. Odd-length hex is read as text: the keyring would pad
// it at the front while the confirmation decodes it without its last digit, so
// the user would approve different bytes from those signed.
const hexRe = /^(?:[0-9A-Fa-f]{2})+$/u;

/**
 * Converts message data to a hex string. Data that is already whole-byte hex
 * (with or without a prefix) is kept; anything else is read as utf8 text.
 *
 * @param {any} data - The message data.
 * @returns {string} A 0x-prefixed hex string.
 */
export function normalizeMsgData(data) {
  try {
    const stripped = ethUtil.stripHexPrefix(data);
    if (stripped.match(hexRe)) {
      return ethUtil.addHexPrefix(stripped);
    }
  } catch (e) {
    log.debug(`Message was not hex encoded, interpreting as utf8.`);
  }

  return ethUtil.bytesToHex(Buffer.from(data, 'utf8'));
}

/**
 * A request held for the user's approval: a signature, decryption or
 * encryption public key request.
 *
 * @typedef {object} Message
 * @property {number} id - An id to track and identify the message object.
 * @property {object} msgParams - The parameters to act on once the request is approved.
 * @property {number} time - The epoch time at which the message was created.
 * @property {string} status - 'unapproved', 'approved', 'rejected', 'errored' or the manager's success status.
 * @property {string} type - The JSON-RPC method of the request.
 */

/**
 * Stores, approves and settles requests that wait for the user. Subclasses
 * create the messages and name the success setter.
 */
export default class BaseMessageManager extends EventEmitter {
  /**
   * Configures the manager for one kind of request.
   *
   * @param {object} options - The manager options.
   * @param {string} options.name - The manager name used in errors.
   * @param {string} options.stateKey - The memStore key for unapproved messages.
   * @param {string} options.countKey - The memStore key for their count.
   * @param {string} options.successStatus - The status a completed request ends in.
   * @param {string} options.resultKey - The message field that holds the result.
   * @param {string} options.label - Names a message in approval errors.
   * @param {string} options.errorPrefix - Prefixes errors returned to the dapp.
   * @param {string} options.rejectedMessage - The message of a user rejection.
   * @param {Function} [options.erroredMessage] - Builds the error message for an
   * errored request from the message.
   */
  constructor({
    name,
    stateKey,
    countKey,
    successStatus,
    resultKey,
    label,
    errorPrefix,
    rejectedMessage,
    erroredMessage = (msg) => `${errorPrefix}: ${msg.error}`,
  }) {
    super();
    this.name = name;
    this.stateKey = stateKey;
    this.countKey = countKey;
    this.successStatus = successStatus;
    this.resultKey = resultKey;
    this.label = label;
    this.errorPrefix = errorPrefix;
    this.rejectedMessage = rejectedMessage;
    this.erroredMessage = erroredMessage;
    // 'errored' always settles the request, so the dapp never waits forever.
    this.finishedStatuses = new Set(['rejected', 'errored', successStatus]);
    this.memStore = new ObservableStore({ [stateKey]: {}, [countKey]: 0 });
    this.messages = [];
  }

  /**
   * Indexes the messages still waiting for the user.
   *
   * @returns {object} An index of message ids to 'unapproved' messages.
   */
  getUnapprovedMsgs() {
    return this.messages
      .filter((msg) => msg.status === 'unapproved')
      .reduce((result, msg) => {
        result[msg.id] = msg;
        return result;
      }, {});
  }

  /**
   * Counts the messages still waiting for the user.
   *
   * @returns {number} The number of 'unapproved' messages.
   */
  getUnapprovedMsgCount() {
    return Object.keys(this.getUnapprovedMsgs()).length;
  }

  /**
   * Adds a message with this.addUnapprovedMessage and settles once the
   * message finishes.
   *
   * @param {...any} args - The arguments for this.addUnapprovedMessage; the
   * first is the request params.
   * @returns {Promise<any>} The result of the request.
   */
  addUnapprovedMessageAsync(...args) {
    return new Promise((resolve, reject) => {
      const msgId = this.addUnapprovedMessage(...args);
      this.once(`${msgId}:finished`, (data) => {
        switch (data.status) {
          case this.successStatus:
            resolve(data[this.resultKey]);
            return;
          case 'rejected':
            reject(
              providerErrors.userRejectedRequest(
                `${this.errorPrefix}: ${this.rejectedMessage}`,
              ),
            );
            return;
          case 'errored':
            reject(new Error(this.erroredMessage(data)));
            return;
          default:
            reject(
              new Error(
                `${this.errorPrefix}: Unknown problem: ${JSON.stringify(args[0])}`,
              ),
            );
        }
      });
    });
  }

  /**
   * Adds a message to this.messages and saves the unapproved messages.
   *
   * @param {Message} msg - The message to add.
   */
  addMsg(msg) {
    this.messages.push(msg);
    this._saveMsgList();
  }

  /**
   * Finds a message by id.
   *
   * @param {number} msgId - The id of the message.
   * @returns {Message|undefined} The message with that id, if any.
   */
  getMsg(msgId) {
    return this.messages.find((msg) => msg.id === msgId);
  }

  /**
   * Approves an unapproved message. Only the stored params are used, so the
   * caller cannot change what the user saw.
   *
   * @param {object} msgParams - The params sent by the UI.
   * @param {number} msgParams.ecfWalletId - The id of the message to approve.
   * @returns {Promise<object>} The stored params, without ecfWalletId.
   */
  approveMessage(msgParams) {
    try {
      const stored = this.getMsg(msgParams.ecfWalletId);
      if (!stored || stored.status !== 'unapproved') {
        throw new Error(`${this.label} is not awaiting approval`);
      }
      this._checkApproval(stored);
      this.setMsgStatusApproved(stored.id);
      return this.prepMsg(this._approvalParams(stored));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   * Throws if a stored message must not be approved. Subclasses override it.
   *
   * @param {Message} _stored - The stored message.
   */
  _checkApproval(_stored) {
    // Every unapproved message may be approved by default.
  }

  /**
   * Builds the params to act on from a stored message.
   *
   * @param {Message} stored - The stored message.
   * @returns {object} A copy of the params to act on.
   */
  _approvalParams(stored) {
    return { ...stored.msgParams };
  }

  /**
   * Removes ecf-wallet's fields from the params.
   *
   * @param {object} msgParams - The params to modify.
   * @returns {Promise<object>} The params without ecfWalletId.
   */
  prepMsg(msgParams) {
    delete msgParams.ecfWalletId;
    return Promise.resolve(msgParams);
  }

  /**
   * Sets a message's status to 'approved'.
   *
   * @param {number} msgId - The id of the message to approve.
   */
  setMsgStatusApproved(msgId) {
    this._setMsgStatus(msgId, 'approved');
  }

  /**
   * Sets a message's status to 'rejected'.
   *
   * @param {number} msgId - The id of the message to reject.
   */
  rejectMsg(msgId) {
    this._setMsgStatus(msgId, 'rejected');
  }

  /**
   * Stores the error of a failed request and sets its status to 'errored'.
   *
   * @param {number} msgId - The id of the message that failed.
   * @param {Error} error - The error that occurred.
   */
  errorMessage(msgId, error) {
    const msg = this._requireMsg(msgId);
    msg.error = error;
    this._updateMsg(msg);
    this._setMsgStatus(msgId, 'errored');
  }

  /**
   * Stores the result of a request and sets the success status.
   *
   * @param {number} msgId - The id of the completed message.
   * @param {any} result - The result for the dapp.
   */
  _setMsgResult(msgId, result) {
    const msg = this._requireMsg(msgId);
    msg[this.resultKey] = result;
    this._updateMsg(msg);
    this._setMsgStatus(msgId, this.successStatus);
  }

  /**
   * Finds a message by id, or throws.
   *
   * @param {number} msgId - The id of the message.
   * @returns {Message} The message.
   * @throws If there is no message with that id.
   */
  _requireMsg(msgId) {
    const msg = this.getMsg(msgId);
    if (!msg) {
      throw new Error(`${this.name} - Message not found for id: "${msgId}".`);
    }
    return msg;
  }

  /**
   * Sets a message's status and emits `${msgId}:${status}`; for a finished
   * status, also emits `${msgId}:finished`.
   *
   * @private
   * @param {number} msgId - The id of the message.
   * @param {string} status - The new status.
   */
  _setMsgStatus(msgId, status) {
    const msg = this._requireMsg(msgId);
    msg.status = status;
    this._updateMsg(msg);
    this.emit(`${msgId}:${status}`, msg);
    if (this.finishedStatuses.has(status)) {
      this.emit(`${msgId}:finished`, msg);
    }
  }

  /**
   * Replaces the message with the same id, then saves the unapproved messages.
   *
   * @private
   * @param {Message} msg - The updated message.
   */
  _updateMsg(msg) {
    const index = this.messages.findIndex((message) => message.id === msg.id);
    if (index !== -1) {
      this.messages[index] = msg;
    }
    this._saveMsgList();
  }

  /**
   * Saves the unapproved messages, and their count, to this.memStore.
   *
   * @private
   * @fires 'updateBadge'
   */
  _saveMsgList() {
    const unapproved = this.getUnapprovedMsgs();
    this.memStore.updateState({
      [this.stateKey]: unapproved,
      [this.countKey]: Object.keys(unapproved).length,
    });
    this.emit('updateBadge');
  }
}
