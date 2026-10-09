import log from 'loglevel';

import BaseMessageManager, { normalizeMsgData } from './base-message-manager';
import { MESSAGE_TYPE } from './enums';
import createId from './random-id';

/**
 * Represents, and contains data about, an 'eth_decrypt' type decryption request. These are created when a
 * decryption for an eth_decrypt call is requested.
 *
 * @typedef {object} DecryptMessage
 * @property {number} id An id to track and identify the message object
 * @property {object} msgParams The parameters to pass to the decryptMessage method once the decryption request is
 * approved.
 * @property {object} msgParams.ecfWalletId Added to msgParams for tracking and identification within ecf-wallet.
 * @property {string} msgParams.data A hex string conversion of the raw buffer data of the decryption request
 * @property {number} time The epoch time at which the this message was created
 * @property {string} status Indicates whether the decryption request is 'unapproved', 'approved', 'decrypted', 'rejected' or 'errored'
 * @property {string} type The json-prc decryption method for which a decryption request has been made. A 'Message' will
 * always have a 'eth_decrypt' type.
 */

export default class DecryptMessageManager extends BaseMessageManager {
  /**
   * Controller in charge of managing - storing, adding, removing, updating - DecryptMessage.
   */
  constructor() {
    super({
      name: 'DecryptMessageManager',
      stateKey: 'unapprovedDecryptMsgs',
      countKey: 'unapprovedDecryptMsgCount',
      successStatus: 'decrypted',
      resultKey: 'rawData',
      label: 'Decryption request',
      errorPrefix: 'ecf-wallet Decryption',
      rejectedMessage: 'User denied message decryption.',
      erroredMessage: () => 'This message cannot be decrypted',
    });
  }

  /**
   * The number of DecryptMessages waiting for the user.
   *
   * @returns {number} The number of 'unapproved' DecryptMessages in this.messages
   */
  get unapprovedDecryptMsgCount() {
    return this.getUnapprovedMsgCount();
  }

  /**
   * Creates a new unapproved DecryptMessage and settles when it is decrypted, rejected or errored.
   *
   * @param {object} msgParams - The params for the eth_decrypt call to be made after the message is approved.
   * @param {object} req - (optional) The original request object possibly containing the origin
   * @returns {Promise<string>} The raw decrypted message contents
   */
  addUnapprovedMessageAsync(msgParams, req) {
    if (!msgParams.from) {
      return Promise.reject(
        new Error(`${this.errorPrefix}: from field is required.`),
      );
    }
    return super.addUnapprovedMessageAsync(msgParams, req);
  }

  /**
   * Creates a new DecryptMessage with an 'unapproved' status using the passed msgParams.
   *
   * @param {object} inputParams - The params for the eth_decrypt call to be made after the message is approved.
   * @param {object} req - (optional) The original request object possibly containing the origin
   * @returns {number} The id of the newly created DecryptMessage.
   */
  addUnapprovedMessage(inputParams, req) {
    log.debug(
      `DecryptMessageManager addUnapprovedMessage: ${JSON.stringify(inputParams)}`,
    );
    const msgParams = { ...inputParams };
    // add origin from request
    if (req) {
      msgParams.origin = req.origin;
    }
    msgParams.data = normalizeMsgData(msgParams.data);
    const msgId = createId();
    this.addMsg({
      id: msgId,
      msgParams,
      time: new Date().getTime(),
      status: 'unapproved',
      type: MESSAGE_TYPE.ETH_DECRYPT,
    });

    // signal update
    this.emit('update');
    return msgId;
  }

  /**
   * Sets a DecryptMessage status to 'decrypted' and stores the decrypted data.
   *
   * @param {number} msgId - The id of the DecryptMessage to decrypt.
   * @param {string} rawData - The raw data of the message request
   */
  setMsgStatusDecrypted(msgId, rawData) {
    this._setMsgResult(msgId, rawData);
  }

  /**
   * Removes the ecfWalletId property from passed msgParams.
   *
   * @param {object} msgParams - The msgParams to modify
   * @returns {Promise<object>} Promises the msgParams with the ecfWalletId property removed
   */
  prepMsgForDecryption(msgParams) {
    return this.prepMsg(msgParams);
  }
}
