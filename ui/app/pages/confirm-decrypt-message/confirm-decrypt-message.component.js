import classnames from 'classnames';
import copyToClipboard from 'copy-to-clipboard';
import PropTypes from 'prop-types';
import React, { useState } from 'react';

import ConfirmRequestLayout, {
  RequestOrigin,
} from '../../components/app/confirm-request-layout';
import Copy from '../../components/ui/icon/copy-icon.component';
import Tooltip from '../../components/ui/tooltip';
import { useCopiedFlag } from '../../hooks/useCopiedFlag';
import { useI18nContext } from '../../hooks/useI18nContext';

export default function ConfirmDecryptMessage({
  cancelDecryptMessage,
  decryptMessage,
  decryptMessageInline,
  txData,
  domainMetadata,
}) {
  const t = useI18nContext();
  const [copyToClipboardPressed, setCopyToClipboardPressed] = useState(false);
  const [hasCopied, markCopied] = useCopiedFlag(3000);
  const [hasDecrypted, setHasDecrypted] = useState(false);
  const [rawMessage, setRawMessage] = useState();
  const [errorMessage, setErrorMessage] = useState();
  const hasError = errorMessage !== undefined;

  const origin = domainMetadata[txData.msgParams.origin];

  const copyMessage = () => {
    copyToClipboard(rawMessage);
    markCopied();
  };

  const decryptInline = async (event) => {
    const result = await decryptMessageInline(txData, event);
    if (result.error) {
      setErrorMessage(t('decryptInlineError', [result.error]));
    } else {
      setHasDecrypted(true);
      setRawMessage(result.rawData);
    }
  };

  const revealed = hasDecrypted || hasError;

  return (
    <ConfirmRequestLayout
      title={t('decryptRequest')}
      fromAddress={txData.msgParams.from}
      onCancel={(event) => cancelDecryptMessage(txData, event)}
      onConfirm={(event) => decryptMessage(txData, event)}
      confirmText={t('decrypt')}
    >
      <RequestOrigin origin={origin}>
        <div className="request-decrypt-message__notice">
          {t('decryptMessageNotice', [origin.name])}
        </div>
      </RequestOrigin>
      <div className="request-decrypt-message__message">
        <div className="request-decrypt-message__message-text">
          {revealed ? rawMessage : txData.msgParams.data}
          {errorMessage}
        </div>
        <div
          className={classnames('request-decrypt-message__message-cover', {
            'request-decrypt-message__message-lock--pressed': revealed,
          })}
        />
        <div
          className={classnames('request-decrypt-message__message-lock', {
            'request-decrypt-message__message-lock--pressed': revealed,
          })}
          onClick={decryptInline}
        >
          <img src="images/lock.svg" />
          <div className="request-decrypt-message__message-lock-text">
            {t('decryptEcfWallet')}
          </div>
        </div>
      </div>
      {hasDecrypted && (
        <div
          className={classnames('request-decrypt-message__message-copy', {
            'request-decrypt-message__message-copy--pressed':
              copyToClipboardPressed,
          })}
          onClick={copyMessage}
          onMouseDown={() => setCopyToClipboardPressed(true)}
          onMouseUp={() => setCopyToClipboardPressed(false)}
        >
          <Tooltip
            position="bottom"
            title={hasCopied ? t('copiedExclamation') : t('copyToClipboard')}
            wrapperClassName="request-decrypt-message__message-copy-tooltip"
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <div className="request-decrypt-message__message-copy-text">
              {t('decryptCopy')}
            </div>
            <Copy size={17} color="currentColor" />
          </Tooltip>
        </div>
      )}
    </ConfirmRequestLayout>
  );
}

ConfirmDecryptMessage.propTypes = {
  cancelDecryptMessage: PropTypes.func.isRequired,
  decryptMessage: PropTypes.func.isRequired,
  decryptMessageInline: PropTypes.func.isRequired,
  txData: PropTypes.object.isRequired,
  domainMetadata: PropTypes.object.isRequired,
};
