import PropTypes from 'prop-types';
import React from 'react';

import ConfirmRequestLayout, {
  RequestOrigin,
} from '../../components/app/confirm-request-layout';
import { useI18nContext } from '../../hooks/useI18nContext';

export default function ConfirmEncryptionPublicKey({
  cancelEncryptionPublicKey,
  encryptionPublicKey,
  txData,
  domainMetadata,
}) {
  const t = useI18nContext();
  const origin = domainMetadata[txData.origin];

  return (
    <ConfirmRequestLayout
      title={t('encryptionPublicKeyRequest')}
      // The request's params are the address whose key is asked for.
      fromAddress={txData.msgParams}
      onCancel={(event) => cancelEncryptionPublicKey(txData, event)}
      onConfirm={(event) => encryptionPublicKey(txData, event)}
      confirmText={t('provide')}
    >
      <RequestOrigin origin={origin}>
        <div className="request-encryption-public-key__notice">
          {t('encryptionPublicKeyNotice', [origin.name])}
        </div>
      </RequestOrigin>
    </ConfirmRequestLayout>
  );
}

ConfirmEncryptionPublicKey.propTypes = {
  cancelEncryptionPublicKey: PropTypes.func.isRequired,
  encryptionPublicKey: PropTypes.func.isRequired,
  txData: PropTypes.object.isRequired,
  domainMetadata: PropTypes.object.isRequired,
};
