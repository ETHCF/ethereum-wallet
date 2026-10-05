import { isValidAddress } from '@ethereumjs/util';
import { ObservableStore } from '@metamask/obs-store';
import { providerErrors } from '@metamask/rpc-errors';
import assert from 'assert';
import BN from 'bn.js';
import EventEmitter from 'events';
import jsonschema from 'jsonschema';
import log from 'loglevel';

import { MESSAGE_TYPE } from './enums';
import createId from './random-id';
import { validateTypedData, typedDataSchema } from './signing-utils';

/**
 * Represents, and contains data about, an 'eth_signTypedData' type signature request. These are created when a
 * signature for an eth_signTypedData call is requested.
 *
 * @typedef {object} TypedMessage
 * @property {number} id An id to track and identify the message object
 * @property {object} msgParams The parameters to pass to the eth_signTypedData method once the signature request is
 * approved.
 * @property {object} msgParams.ecfWalletId Added to msgParams for tracking and identification within ecf-wallet.
 * @property {object} msgParams.from The address that is making the signature request.
 * @property {string} msgParams.data A hex string conversion of the raw buffer data of the signature request
 * @property {number} time The epoch time at which the this message was created
 * @property {string} status Indicates whether the signature request is 'unapproved', 'approved', 'signed', 'rejected', or 'errored'
 * @property {string} type The json-prc signing method for which a signature request has been made. A 'Message' will
 * always have a 'eth_signTypedData' type.
 */

export default class TypedMessageManager extends EventEmitter {
  /**
   * Controller in charge of managing - storing, adding, removing, updating - TypedMessage.
   *
   * @param {object} options - The manager options.
   * @param {object} options.networkController - The network controller.
   */
  constructor({ networkController }) {
    super();
    this.networkController = networkController;
    this.memStore = new ObservableStore({
      unapprovedTypedMessages: {},
      unapprovedTypedMessagesCount: 0,
    });
    this.messages = [];
  }

  /**
   * A getter for the number of 'unapproved' TypedMessages in this.messages
   *
   * @returns {number} The number of 'unapproved' TypedMessages in this.messages
   */
  get unapprovedTypedMessagesCount() {
    return Object.keys(this.getUnapprovedMsgs()).length;
  }

  /**
   * A getter for the 'unapproved' TypedMessages in this.messages
   *
   * @returns {object} An index of TypedMessage ids to TypedMessages, for all 'unapproved' TypedMessages in
   * this.messages
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
   * Creates a new TypedMessage with an 'unapproved' status using the passed msgParams. this.addMsg is called to add
   * the new TypedMessage to this.messages, and to save the unapproved TypedMessages from that list to
   * this.memStore. Before any of this is done, msgParams are validated
   *
   * @param {object} msgParams - The params for the eth_sign call to be made after the message is approved.
   * @param {object} req - (optional) The original request object possibly containing the origin
   * @param {string} version - The typed data version: 'V1', 'V3' or 'V4'.
   * @param {object[]} [securityAlerts] - Warnings about the request to show the user.
   * @returns {Promise} When the message has been signed or rejected
   */
  addUnapprovedMessageAsync(msgParams, req, version, securityAlerts) {
    return new Promise((resolve, reject) => {
      const msgId = this.addUnapprovedMessage(
        msgParams,
        req,
        version,
        securityAlerts,
      );
      this.once(`${msgId}:finished`, (data) => {
        switch (data.status) {
          case 'signed':
            return resolve(data.rawSig);
          case 'rejected':
            return reject(
              providerErrors.userRejectedRequest(
                'ecf-wallet Message Signature: User denied message signature.',
              ),
            );
          case 'errored':
            return reject(
              new Error(`ecf-wallet Message Signature: ${data.error}`),
            );
          default:
            return reject(
              new Error(
                `ecf-wallet Message Signature: Unknown problem: ${JSON.stringify(msgParams)}`,
              ),
            );
        }
      });
    });
  }

  /**
   * Creates a new TypedMessage with an 'unapproved' status using the passed msgParams. this.addMsg is called to add
   * the new TypedMessage to this.messages, and to save the unapproved TypedMessages from that list to
   * this.memStore. Before any of this is done, msgParams are validated
   *
   * @param {object} inputParams - The params for the eth_sign call to be made after the message is approved.
   * @param {object} req - (optional) The original request object possibly containing the origin
   * @param {string} version - The typed data version: 'V1', 'V3' or 'V4'.
   * @param {object[]} [securityAlerts] - Warnings about the request to show the user.
   * @returns {number} The id of the newly created TypedMessage.
   */
  addUnapprovedMessage(inputParams, req, version, securityAlerts = []) {
    const msgParams = {
      ...inputParams,
      data:
        typeof inputParams.data === 'object'
          ? JSON.parse(JSON.stringify(inputParams.data))
          : inputParams.data,
    };
    msgParams.version = version;
    if (['V3', 'V4'].includes(version) && typeof msgParams.data === 'object') {
      msgParams.data = JSON.stringify(msgParams.data);
    }
    if (req) {
      msgParams.origin = req.origin;
    }
    this.validateParams(msgParams);

    log.debug(
      `TypedMessageManager addUnapprovedMessage: ${JSON.stringify(msgParams)}`,
    );

    // create txData obj with parameters and meta data
    const time = new Date().getTime();
    const msgId = createId();
    const msgData = {
      id: msgId,
      msgParams,
      time,
      status: 'unapproved',
      type: MESSAGE_TYPE.ETH_SIGN_TYPED_DATA,
      securityAlerts,
    };
    this.addMsg(msgData);

    // signal update
    this.emit('update');
    return msgId;
  }

  /**
   * Helper method for this.addUnapprovedMessage. Validates that the passed params have the required properties.
   *
   * @param {object} params - The params to validate
   */
  validateParams(params) {
    assert.ok(
      params && typeof params === 'object',
      'Params must be an object.',
    );
    assert.ok(
      Object.hasOwn(params, 'data'),
      'Params must include a "data" field.',
    );
    assert.ok(
      Object.hasOwn(params, 'from'),
      'Params must include a "from" field.',
    );
    assert.ok(
      typeof params.from === 'string' && isValidAddress(params.from),
      '"from" field must be a valid, lowercase, hexadecimal Ethereum address string.',
    );

    switch (params.version) {
      case 'V1':
        assert.ok(
          Array.isArray(params.data),
          '"params.data" must be an array.',
        );
        assert.doesNotThrow(() => {
          validateTypedData(params.data, 'V1');
        }, 'Signing data must be valid EIP-712 typed data.');
        break;
      case 'V3':
      case 'V4': {
        assert.equal(
          typeof params.data,
          'string',
          '"params.data" must be a string.',
        );
        let data;
        assert.doesNotThrow(() => {
          data = JSON.parse(params.data);
        }, '"data" must be a valid JSON string.');
        const validation = jsonschema.validate(data, typedDataSchema());
        // Only the request's own type definitions count; `in` would also
        // accept inherited names such as "toString".
        assert.ok(
          typeof data.types === 'object' &&
            data.types !== null &&
            Object.hasOwn(data.types, data.primaryType),
          `Primary type of "${data.primaryType}" has no type definition.`,
        );
        assert.equal(
          validation.errors.length,
          0,
          'Signing data must conform to EIP-712 schema. See https://git.io/fNtcx.',
        );
        validateTypedData(data, params.version);
        const { chainId } = data.domain;
        const activeChainId = this.networkController.getChainId
          ? this.networkController.getChainId()
          : this.networkController.getNetworkState();
        if (chainId !== undefined) {
          const chainQuantity = (value) => {
            const text = String(value);
            assert.ok(
              (typeof value === 'string' || Number.isSafeInteger(value)) &&
                /^(?:0x[0-9a-f]+|[0-9]+)$/iu.test(text),
              'Invalid chain ID',
            );
            return new BN(
              text.replace(/^0x/iu, ''),
              /^0x/iu.test(text) ? 16 : 10,
            );
          };
          assert.ok(
            chainQuantity(chainId).eq(chainQuantity(activeChainId)),
            `Provided chainId "${chainId}" must match the active chainId "${activeChainId}"`,
          );
        }
        break;
      }
      default:
        assert.fail(`Unknown typed data version "${params.version}"`);
    }
  }

  /**
   * Adds a passed TypedMessage to this.messages, and calls this._saveMsgList() to save the unapproved TypedMessages from that
   * list to this.memStore.
   *
   * @param {TypedMessage} msg - The TypedMessage to add to this.messages
   */
  addMsg(msg) {
    this.messages.push(msg);
    this._saveMsgList();
  }

  /**
   * Returns a specified TypedMessage.
   *
   * @param {number} msgId - The id of the TypedMessage to get
   * @returns {TypedMessage|undefined} The TypedMessage with the id that matches the passed msgId, or undefined
   * if no TypedMessage has that id.
   */
  getMsg(msgId) {
    return this.messages.find((msg) => msg.id === msgId);
  }

  /**
   * Approves a TypedMessage. Sets the message status via a call to this.setMsgStatusApproved, and returns a promise
   * with any the message params modified for proper signing.
   *
   * @param {object} msgParams - The msgParams to be used when eth_sign is called, plus data added by ecf-wallet.
   * @param {object} msgParams.ecfWalletId - Added to msgParams for tracking and identification within ecf-wallet.
   * @returns {Promise<object>} Promises the msgParams object with ecfWalletId removed.
   */
  approveMessage(msgParams) {
    const stored = this.getMsg(msgParams.ecfWalletId);
    if (!stored || stored.status !== 'unapproved') {
      throw new Error('Typed message is not awaiting approval');
    }
    this.validateParams(stored.msgParams);
    this.setMsgStatusApproved(stored.id);
    return this.prepMsgForSigning({ ...stored.msgParams });
  }

  /**
   * Sets a TypedMessage status to 'approved' via a call to this._setMsgStatus.
   *
   * @param {number} msgId - The id of the TypedMessage to approve.
   */
  setMsgStatusApproved(msgId) {
    this._setMsgStatus(msgId, 'approved');
  }

  /**
   * Sets a TypedMessage status to 'signed' via a call to this._setMsgStatus and updates that TypedMessage in
   * this.messages by adding the raw signature data of the signature request to the TypedMessage
   *
   * @param {number} msgId - The id of the TypedMessage to sign.
   * @param {string} rawSig - The raw data of the signature request
   */
  setMsgStatusSigned(msgId, rawSig) {
    const msg = this.getMsg(msgId);
    msg.rawSig = rawSig;
    this._updateMsg(msg);
    this._setMsgStatus(msgId, 'signed');
  }

  /**
   * Removes the ecfWalletId property from passed msgParams and returns a promise which resolves the updated msgParams
   *
   * @param {object} msgParams - The msgParams to modify
   * @returns {Promise<object>} Promises the msgParams with the ecfWalletId property removed
   */
  prepMsgForSigning(msgParams) {
    delete msgParams.ecfWalletId;
    delete msgParams.version;
    return Promise.resolve(msgParams);
  }

  /**
   * Sets a TypedMessage status to 'rejected' via a call to this._setMsgStatus.
   *
   * @param {number} msgId - The id of the TypedMessage to reject.
   */
  rejectMsg(msgId) {
    this._setMsgStatus(msgId, 'rejected');
  }

  /**
   * Sets a TypedMessage status to 'errored' via a call to this._setMsgStatus.
   *
   * @param {number} msgId - The id of the TypedMessage to error
   * @param {Error} error - The error that occurred.
   */
  errorMessage(msgId, error) {
    const msg = this.getMsg(msgId);
    msg.error = error;
    this._updateMsg(msg);
    this._setMsgStatus(msgId, 'errored');
  }

  //
  // PRIVATE METHODS
  //

  /**
   * Updates the status of a TypedMessage in this.messages via a call to this._updateMsg.
   * Fires an event with a name equal to `${msgId}:${status}`, along with the TypedMessage.
   * If status is 'rejected', 'signed' or 'errored', an event with a name equal to `${msgId}:finished` is fired along
   * with the TypedMessage.
   *
   * @private
   * @param {number} msgId - The id of the TypedMessage to update.
   * @param {string} status - The new status of the TypedMessage.
   * @throws A 'TypedMessageManager - TypedMessage not found for id: "${msgId}".' if there is no TypedMessage
   * in this.messages with an id equal to the passed msgId
   */
  _setMsgStatus(msgId, status) {
    const msg = this.getMsg(msgId);
    if (!msg) {
      throw new Error(
        `TypedMessageManager - Message not found for id: "${msgId}".`,
      );
    }
    msg.status = status;
    this._updateMsg(msg);
    this.emit(`${msgId}:${status}`, msg);
    if (status === 'rejected' || status === 'signed' || status === 'errored') {
      this.emit(`${msgId}:finished`, msg);
    }
  }

  /**
   * Sets a TypedMessage in this.messages to the passed TypedMessage if the ids are equal. Then saves the
   * unapprovedTypedMsgs index to storage via this._saveMsgList
   *
   * @private
   * @param {TypedMessage} msg - A TypedMessage that will replace an existing TypedMessage (with the same
   * id) in this.messages
   */
  _updateMsg(msg) {
    const index = this.messages.findIndex((message) => message.id === msg.id);
    if (index !== -1) {
      this.messages[index] = msg;
    }
    this._saveMsgList();
  }

  /**
   * Saves the unapproved TypedMessages, and their count, to this.memStore
   *
   * @private
   * @fires 'updateBadge'
   */
  _saveMsgList() {
    const unapprovedTypedMessages = this.getUnapprovedMsgs();
    const unapprovedTypedMessagesCount = Object.keys(
      unapprovedTypedMessages,
    ).length;
    this.memStore.updateState({
      unapprovedTypedMessages,
      unapprovedTypedMessagesCount,
    });
    this.emit('updateBadge');
  }
}
