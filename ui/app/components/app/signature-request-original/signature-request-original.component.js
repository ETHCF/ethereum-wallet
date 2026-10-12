import * as ethUtil from '@ethereumjs/util';
import PropTypes from 'prop-types';
import React from 'react';

import SiweDetails from './siwe-details';
import { MESSAGE_TYPE } from '../../../../../app/scripts/lib/enums';
import { useI18nContext } from '../../../hooks/useI18nContext';
import ConfirmRequestLayout from '../confirm-request-layout';

const msgHexToText = (hex) => {
  try {
    const stripped = ethUtil.stripHexPrefix(hex);
    const buff = Buffer.from(stripped, 'hex');
    return buff.length === 32 ? hex : buff.toString('utf8');
  } catch (e) {
    return hex;
  }
};

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
  const rows = isPersonalSign
    ? [{ name: t('message'), value: msgHexToText(data) }]
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
