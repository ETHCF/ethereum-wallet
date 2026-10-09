import log from 'loglevel';

import { valuesFor } from '../app/helpers/utils/util';

/**
 * Flattens the pending approval maps into one list, oldest first.
 * Transactions are limited to `network` when it is given; signature,
 * decryption and encryption-key requests are not network specific.
 *
 * @param {object} unapprovedTxs - Unapproved transactions keyed by id.
 * @param {object} personalMsgs - Unapproved personal_sign requests keyed by id.
 * @param {object} decryptMsgs - Unapproved eth_decrypt requests keyed by id.
 * @param {object} encryptionPublicKeyMsgs - Unapproved eth_getEncryptionPublicKey requests keyed by id.
 * @param {object} typedMessages - Unapproved eth_signTypedData requests keyed by id.
 * @param {string} [network] - The current network id.
 * @returns {object[]} The pending items sorted by time, oldest first.
 */
export default function txHelper(
  unapprovedTxs,
  personalMsgs,
  decryptMsgs,
  encryptionPublicKeyMsgs,
  typedMessages,
  network,
) {
  const txValues = network
    ? valuesFor(unapprovedTxs).filter(
        (txMeta) => txMeta.ecfWalletNetworkId === network,
      )
    : valuesFor(unapprovedTxs);
  const personalValues = valuesFor(personalMsgs);
  const decryptValues = valuesFor(decryptMsgs);
  const encryptionPublicKeyValues = valuesFor(encryptionPublicKeyMsgs);
  const typedValues = valuesFor(typedMessages);

  log.debug(
    `tx helper found ${txValues.length} unapproved txs, ` +
      `${personalValues.length} personal messages, ` +
      `${decryptValues.length} decrypt requests, ` +
      `${encryptionPublicKeyValues.length} encryptionPublicKey requests, ` +
      `${typedValues.length} typed messages`,
  );

  return txValues
    .concat(
      personalValues,
      decryptValues,
      encryptionPublicKeyValues,
      typedValues,
    )
    .sort((a, b) => a.time - b.time);
}
