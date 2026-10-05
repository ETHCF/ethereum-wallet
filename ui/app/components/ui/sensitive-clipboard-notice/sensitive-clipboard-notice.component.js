import PropTypes from 'prop-types';
import React from 'react';

import { useI18nContext } from '../../../hooks/useI18nContext';

export default function SensitiveClipboardNotice({ state, onClear }) {
  const t = useI18nContext();

  if (state === 'idle') {
    return null;
  }
  if (state === 'cleared') {
    return (
      <div
        className="sensitive-clipboard-notice sensitive-clipboard-notice--cleared"
        data-testid="sensitive-clipboard-cleared"
      >
        {t('clipboardCleared')}
      </div>
    );
  }
  return (
    <div
      className="sensitive-clipboard-notice"
      data-testid="sensitive-clipboard-warning"
    >
      <div>
        {t(
          state === 'error'
            ? 'clipboardClearFailed'
            : 'sensitiveClipboardWarning',
        )}
      </div>
      <button
        type="button"
        className="sensitive-clipboard-notice__clear"
        data-testid="clear-sensitive-clipboard"
        onClick={onClear}
      >
        {t('clearClipboardNow')}
      </button>
    </div>
  );
}

SensitiveClipboardNotice.propTypes = {
  state: PropTypes.oneOf(['idle', 'copied', 'cleared', 'error']).isRequired,
  onClear: PropTypes.func.isRequired,
};
