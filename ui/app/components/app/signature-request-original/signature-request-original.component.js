import * as ethUtil from '@ethereumjs/util';
import PropTypes from 'prop-types';
import React from 'react';

import SiweDetails from './siwe-details';
import { UNSAFE_TEXT } from '../../../../../app/scripts/controllers/network/chain-utils';
import { MESSAGE_TYPE } from '../../../../../app/scripts/lib/enums';
import { useI18nContext } from '../../../hooks/useI18nContext';
import ConfirmRequestLayout from '../confirm-request-layout';
import SecurityAlerts from '../security-alerts';

// Line breaks and tabs lay out ordinary messages; every other control,
// zero-width or bidi character is shown as an escape instead.
const LAYOUT_CHARACTERS = new Set(['\n', '\r', '\t']);
const UNSAFE_CHARACTERS = new RegExp(UNSAFE_TEXT.source, 'gu');

const warning = (id) => ({ id, severity: 'warning' });

/**
 * How to show a personal_sign message: as text only when its bytes are
 * exactly that text, with characters that can hide or reorder text escaped.
 *
 * @param {string} data - The message as hex.
 * @returns {{text: string, alerts: object[]}} The text to show, and warnings
 * about it.
 */
export function describePersonalMessage(data) {
  let text = typeof data === 'string' ? data : '';
  if (/^0x(?:[0-9a-f]{2})*$/iu.test(text)) {
    const stripped = ethUtil.stripHexPrefix(text);
    const bytes = Buffer.from(stripped, 'hex');
    if (bytes.length === 32) {
      return {
        text: `0x${stripped}`,
        alerts: [warning('alertPersonalSignHash')],
      };
    }
    text = bytes.toString('utf8');
    // Bytes that are not UTF-8 decode lossily, so the text would not be what
    // is signed.
    if (!Buffer.from(text, 'utf8').equals(bytes)) {
      return {
        text: `0x${stripped}`,
        alerts: [warning('alertPersonalSignNotText')],
      };
    }
  }
  let hidden = false;
  const escaped = text.replace(UNSAFE_CHARACTERS, (character) => {
    if (LAYOUT_CHARACTERS.has(character)) {
      return character;
    }
    hidden = true;
    return `\\u{${character.codePointAt(0).toString(16).toUpperCase()}}`;
  });
  return {
    text: escaped,
    alerts: hidden ? [warning('alertPersonalSignHiddenCharacters')] : [],
  };
}

export default function SignatureRequestOriginal({
  txData,
  signPersonalMessage,
  signTypedMessage,
  cancelPersonalMessage,
  cancelTypedMessage,
}) {
  const t = useI18nContext();
  const {
    type,
    msgParams: { data, from, siwe, origin },
  } = txData;

  // conf-tx shows this page for personal_sign and for v1 typed data.
  const isPersonalSign = type === MESSAGE_TYPE.PERSONAL_SIGN;
  const message = isPersonalSign ? describePersonalMessage(data) : undefined;
  const rows = isPersonalSign
    ? [{ name: t('message'), value: message.text }]
    : data;

  return (
    <ConfirmRequestLayout
      title={t('sigRequest')}
      fromAddress={from}
      origin={origin}
      onCancel={isPersonalSign ? cancelPersonalMessage : cancelTypedMessage}
      onConfirm={isPersonalSign ? signPersonalMessage : signTypedMessage}
      confirmText={t('sign')}
      confirmDisabled={Boolean(siwe?.errors?.length)}
      cancelButtonClassName="request-signature__footer__cancel-button"
      confirmButtonTestId="request-signature__sign"
    >
      <div className="request-signature__request-info">
        <div className="request-signature__headline">
          {t('yourSigRequested')}
        </div>
      </div>
      {siwe && <SiweDetails siwe={siwe} origin={origin} />}
      {message && <SecurityAlerts alerts={message.alerts} />}
      <div className="request-signature__notice">{`${t('youSign')}:`}</div>
      <div className="request-signature__rows">
        {rows.map(({ name, value }, index) => (
          <div
            className="request-signature__row"
            key={`request-signature-row-${index}`}
          >
            <div className="request-signature__row-title">{`${name}:`}</div>
            <div className="request-signature__row-value">
              {typeof value === 'boolean' ? value.toString() : value}
            </div>
          </div>
        ))}
      </div>
    </ConfirmRequestLayout>
  );
}

SignatureRequestOriginal.propTypes = {
  txData: PropTypes.object.isRequired,
  signPersonalMessage: PropTypes.func.isRequired,
  signTypedMessage: PropTypes.func.isRequired,
  cancelPersonalMessage: PropTypes.func.isRequired,
  cancelTypedMessage: PropTypes.func.isRequired,
};
