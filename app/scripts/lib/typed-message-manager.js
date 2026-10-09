import { isValidAddress } from '@ethereumjs/util';
import assert from 'assert';
import BN from 'bn.js';
import jsonschema from 'jsonschema';
import log from 'loglevel';

import BaseMessageManager from './base-message-manager';
import { MESSAGE_TYPE } from './enums';
import createId from './random-id';
import {
  TYPED_MESSAGE_SCHEMA,
  canonicalizeTypedData,
  validateTypedData,
} from './signing-utils';

/**
 * Canonicalizes eth_signTypedData data as sent by a site: V1 as an array, V3
 * and V4 as an object or a JSON string. Data that does not parse is returned
 * unchanged, for validateParams to reject.
 *
 * @param {object | object[] | string} data - The typed data.
 * @param {string} version - The typed data version: 'V1', 'V3' or 'V4'.
 * @returns {object | object[] | string} The canonical data.
 */
export function canonicalizeTypedMessage(data, version) {
  let parsed = data;
  if (typeof data === 'string' && version !== 'V1') {
    try {
      parsed = JSON.parse(data);
    } catch (_) {
      return data;
    }
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) !== (version === 'V1')
  ) {
    return data;
  }
  try {
    return canonicalizeTypedData(parsed, version);
  } catch (error) {
    throw new Error(
      `Signing data must be valid EIP-712 typed data. ${error.message}`,
    );
  }
}

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

export default class TypedMessageManager extends BaseMessageManager {
  /**
   * Controller in charge of managing - storing, adding, removing, updating - TypedMessage.
   *
   * @param {object} options - The manager options.
   * @param {Function} options.getChainId - Returns the current chain ID, which EIP-712 domains must match.
   */
  constructor({ getChainId }) {
    super({
      name: 'TypedMessageManager',
      stateKey: 'unapprovedTypedMessages',
      countKey: 'unapprovedTypedMessagesCount',
      successStatus: 'signed',
      resultKey: 'rawSig',
      label: 'Typed message',
      errorPrefix: 'ecf-wallet Message Signature',
      rejectedMessage: 'User denied message signature.',
    });
    this.getChainId = getChainId;
  }

  /**
   * The number of TypedMessages waiting for the user.
   *
   * @returns {number} The number of 'unapproved' TypedMessages in this.messages
   */
  get unapprovedTypedMessagesCount() {
    return this.getUnapprovedMsgCount();
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
    msgParams.data = canonicalizeTypedMessage(msgParams.data, version);
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

    const msgId = createId();
    this.addMsg({
      id: msgId,
      msgParams,
      time: new Date().getTime(),
      status: 'unapproved',
      type: MESSAGE_TYPE.ETH_SIGN_TYPED_DATA,
      securityAlerts,
    });

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
        const validation = jsonschema.validate(data, TYPED_MESSAGE_SCHEMA);
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
        const activeChainId = this.getChainId();
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
   * Revalidates the stored params before approval.
   *
   * @param {TypedMessage} stored - The stored message.
   */
  _checkApproval(stored) {
    this.validateParams(stored.msgParams);
  }

  /**
   * Sets a TypedMessage status to 'signed' and stores its signature.
   *
   * @param {number} msgId - The id of the TypedMessage to sign.
   * @param {string} rawSig - The raw data of the signature request
   */
  setMsgStatusSigned(msgId, rawSig) {
    this._setMsgResult(msgId, rawSig);
  }

  /**
   * Removes the ecfWalletId and version properties from passed msgParams.
   *
   * @param {object} msgParams - The msgParams to modify
   * @returns {Promise<object>} Promises the msgParams without ecf-wallet's fields
   */
  prepMsg(msgParams) {
    delete msgParams.version;
    return super.prepMsg(msgParams);
  }

  /**
   * Removes the ecfWalletId and version properties from passed msgParams.
   *
   * @param {object} msgParams - The msgParams to modify
   * @returns {Promise<object>} Promises the msgParams without ecf-wallet's fields
   */
  prepMsgForSigning(msgParams) {
    return this.prepMsg(msgParams);
  }
}
