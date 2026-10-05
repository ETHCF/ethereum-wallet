import PropTypes from 'prop-types';
import React from 'react';

import { exportAsFile } from '../../../helpers/utils/util';
import { useI18nContext } from '../../../hooks/useI18nContext';
import { useSensitiveClipboard } from '../../../hooks/useSensitiveClipboard';
import Copy from '../icon/copy-icon.component';
import SensitiveClipboardNotice from '../sensitive-clipboard-notice';

function ExportTextContainer({ text = '' }) {
  const t = useI18nContext();
  // Only secrets are exported, so copies are cleared from the clipboard later.
  const [clipboardState, handleCopy, clearClipboard] = useSensitiveClipboard();

  return (
    <div className="export-text-container">
      <div className="export-text-container__text-container">
        <div className="export-text-container__text notranslate">{text}</div>
      </div>
      <div className="export-text-container__buttons-container">
        <div
          className="export-text-container__button export-text-container__button--copy"
          onClick={() => {
            handleCopy(text);
          }}
        >
          <Copy size={17} color="currentColor" />
          <div className="export-text-container__button-text">
            {clipboardState === 'copied'
              ? t('copiedExclamation')
              : t('copyToClipboard')}
          </div>
        </div>
        <div
          className="export-text-container__button"
          onClick={() => exportAsFile('', text)}
        >
          <img src="images/download.svg" alt="" />
          <div className="export-text-container__button-text">
            {t('saveAsCsvFile')}
          </div>
        </div>
      </div>
      <SensitiveClipboardNotice
        state={clipboardState}
        onClear={clearClipboard}
      />
    </div>
  );
}

ExportTextContainer.propTypes = {
  text: PropTypes.string,
};

export default React.memo(ExportTextContainer);
