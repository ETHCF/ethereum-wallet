import log from 'loglevel';

import BaseMessageManager, { normalizeMsgData } from './base-message-manager';
import { MESSAGE_TYPE } from './enums';
import createId from './random-id';
import { detectSIWE } from './signing-utils';

/**
 * Represents, and contains data about, an 'personal_sign' type signature request. These are created when a
 * signature for an personal_sign call is requested.
 *
 * @see {@link https://web3js.readthedocs.io/en/1.0/web3-eth-personal.html#sign}
 *
 * @typedef {object} PersonalMessage
 * @property {number} id An id to track and identify the message object
 * @property {object} msgParams The parameters to pass to the personal_sign method once the signature request is
 * approved.
 * @property {object} msgParams.ecfWalletId Added to msgParams for tracking and identification within ecf-wallet.
 * @property {string} msgParams.data A hex string conversion of the raw buffer data of the signature request
 * @property {number} time The epoch time at which the this message was created
 * @property {string} status Indicates whether the signature request is 'unapproved', 'approved', 'signed', 'rejected' or 'errored'
 * @property {string} type The json-prc signing method for which a signature request has been made. A 'Message' will
 * always have a 'personal_sign' type.
 */

export default class PersonalMessageManager extends BaseMessageManager {
  /**
   * Controller in charge of managing - storing, adding, removing, updating - PersonalMessage.
   *
   * @param {object} [opts] - The manager options.
   * @param {Function} [opts.getChainId] - Returns the current chain ID, used to check Sign-In with Ethereum requests.
   */
  constructor({ getChainId = () => undefined } = {}) {
    super({
      name: 'PersonalMessageManager',
      stateKey: 'unapprovedPersonalMsgs',
      countKey: 'unapprovedPersonalMsgCount',
      successStatus: 'signed',
      resultKey: 'rawSig',
      label: 'Personal message',
      errorPrefix: 'ecf-wallet Message Signature',
      rejectedMessage: 'User denied message signature.',
    });
    this.getChainId = getChainId;
  }

  /**
   * The number of PersonalMessages waiting for the user.
   *
   * @returns {number} The number of 'unapproved' PersonalMessages in this.messages
   */
  get unapprovedPersonalMsgCount() {
    return this.getUnapprovedMsgCount();
  }

  /**
   * Creates a new unapproved PersonalMessage and settles when it is signed, rejected or errored.
   *
   * @param {object} msgParams - The params for the personal_sign call to be made after the message is approved.
   * @param {object} req - (optional) The original request object possibly containing the origin
   * @returns {Promise<string>} The signature.
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
   * Creates a new PersonalMessage with an 'unapproved' status using the passed msgParams.
   *
   * @param {object} inputParams - The params for the personal_sign call to be made after the message is approved.
   * @param {object} req - (optional) The original request object possibly containing the origin
   * @returns {number} The id of the newly created PersonalMessage.
   */
  addUnapprovedMessage(inputParams, req) {
    log.debug(
      `PersonalMessageManager addUnapprovedMessage: ${JSON.stringify(inputParams)}`,
    );
    const msgParams = { ...inputParams };
    // add origin from request
    if (req) {
      msgParams.origin = req.origin;
    }
    msgParams.data = normalizeMsgData(msgParams.data);
    delete msgParams.siwe;
    const siwe = detectSIWE(msgParams, this.getChainId());
    if (siwe) {
      msgParams.siwe = siwe;
    }
    const msgId = createId();
    this.addMsg({
      id: msgId,
      msgParams,
      time: new Date().getTime(),
      status: 'unapproved',
      type: MESSAGE_TYPE.PERSONAL_SIGN,
    });

    // signal update
    this.emit('update');
    return msgId;
  }

  /**
   * Rechecks Sign-In with Ethereum requests against the current chain before approval.
   *
   * @param {PersonalMessage} stored - The stored message.
   */
  _checkApproval(stored) {
    const siwe = detectSIWE(stored.msgParams, this.getChainId());
    if (siwe?.errors.length) {
      throw new Error(siwe.errors.join(' '));
    }
  }

  /**
   * Sets a PersonalMessage status to 'signed' and stores its signature.
   *
   * @param {number} msgId - The id of the PersonalMessage to sign.
   * @param {string} rawSig - The raw data of the signature request
   */
  setMsgStatusSigned(msgId, rawSig) {
    this._setMsgResult(msgId, rawSig);
  }

  /**
   * Removes the ecfWalletId property from passed msgParams.
   *
   * @param {object} msgParams - The msgParams to modify
   * @returns {Promise<object>} Promises the msgParams with the ecfWalletId property removed
   */
  prepMsgForSigning(msgParams) {
    return this.prepMsg(msgParams);
  }
}
