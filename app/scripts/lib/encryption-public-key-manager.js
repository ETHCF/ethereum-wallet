import log from 'loglevel';

import BaseMessageManager from './base-message-manager';
import { MESSAGE_TYPE } from './enums';
import createId from './random-id';

/**
 * Represents, and contains data about, an 'eth_getEncryptionPublicKey' type request. These are created when
 * an eth_getEncryptionPublicKey call is requested.
 *
 * @typedef {object} EncryptionPublicKey
 * @property {number} id An id to track and identify the message object
 * @property {string} msgParams The address whose encryption public key is requested.
 * @property {string} [origin] The origin of the request.
 * @property {number} time The epoch time at which the this message was created
 * @property {string} status Indicates whether the request is 'unapproved', 'approved', 'received', 'rejected' or 'errored'
 * @property {string} type The json-prc method for which a request has been made. A 'Message' will
 * always have a 'eth_getEncryptionPublicKey' type.
 */

export default class EncryptionPublicKeyManager extends BaseMessageManager {
  /**
   * Controller in charge of managing - storing, adding, removing, updating - EncryptionPublicKey.
   */
  constructor() {
    super({
      name: 'EncryptionPublicKeyManager',
      stateKey: 'unapprovedEncryptionPublicKeyMsgs',
      countKey: 'unapprovedEncryptionPublicKeyMsgCount',
      successStatus: 'received',
      resultKey: 'rawData',
      label: 'Encryption public key request',
      errorPrefix: 'ecf-wallet EncryptionPublicKey',
      rejectedMessage: 'User denied message EncryptionPublicKey.',
    });
  }

  /**
   * The number of EncryptionPublicKeys waiting for the user.
   *
   * @returns {number} The number of 'unapproved' EncryptionPublicKeys in this.messages
   */
  get unapprovedEncryptionPublicKeyMsgCount() {
    return this.getUnapprovedMsgCount();
  }

  /**
   * Creates a new unapproved EncryptionPublicKey and settles when it is received, rejected or errored.
   *
   * @param {string} address - The param for the eth_getEncryptionPublicKey call to be made after the message is approved.
   * @param {object} req - (optional) The original request object possibly containing the origin
   * @returns {Promise<string>} The raw public key contents
   */
  addUnapprovedMessageAsync(address, req) {
    if (!address) {
      return Promise.reject(
        new Error('ecf-wallet Message: address field is required.'),
      );
    }
    return super.addUnapprovedMessageAsync(address, req);
  }

  /**
   * Creates a new EncryptionPublicKey with an 'unapproved' status for the passed address.
   *
   * @param {string} address - The param for the eth_getEncryptionPublicKey call to be made after the message is approved.
   * @param {object} [req] - The original request object possibly containing the origin
   * @returns {number} The id of the newly created EncryptionPublicKey.
   */
  addUnapprovedMessage(address, req) {
    log.debug(`EncryptionPublicKeyManager addUnapprovedMessage: address`);
    const msgId = createId();
    const msgData = {
      id: msgId,
      msgParams: address,
      time: new Date().getTime(),
      status: 'unapproved',
      type: MESSAGE_TYPE.ETH_GET_ENCRYPTION_PUBLIC_KEY,
    };

    if (req) {
      msgData.origin = req.origin;
    }

    this.addMsg(msgData);

    // signal update
    this.emit('update');
    return msgId;
  }

  /**
   * The stored msgParams is the address; it is returned as `data`, the shape the UI sends.
   *
   * @param {EncryptionPublicKey} stored - The stored message.
   * @returns {object} The params to act on.
   */
  _approvalParams(stored) {
    return { data: stored.msgParams };
  }

  /**
   * Sets a EncryptionPublicKey status to 'received' and stores the public key.
   *
   * @param {number} msgId - The id of the EncryptionPublicKey.
   * @param {string} rawData - The raw data of the message request
   */
  setMsgStatusReceived(msgId, rawData) {
    this._setMsgResult(msgId, rawData);
  }

  /**
   * Removes the ecfWalletId property from passed msgParams.
   *
   * @param {object} msgParams - The msgParams to modify
   * @returns {Promise<object>} Promises the msgParams with the ecfWalletId property removed
   */
  prepMsgForEncryptionPublicKey(msgParams) {
    return this.prepMsg(msgParams);
  }
}
