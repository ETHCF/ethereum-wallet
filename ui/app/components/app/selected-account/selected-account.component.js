import copyToClipboard from 'copy-to-clipboard';
import PropTypes from 'prop-types';
import React from 'react';

import { checksumAddress } from '../../../helpers/utils/util';
import { useCopiedFlag } from '../../../hooks/useCopiedFlag';
import { useI18nContext } from '../../../hooks/useI18nContext';
import Tooltip from '../../ui/tooltip';

export default function SelectedAccount({ selectedIdentity }) {
  const t = useI18nContext();
  const [copied, markCopied] = useCopiedFlag(3000);
  const checksummedAddress = checksumAddress(selectedIdentity.address);

  return (
    <div className="selected-account">
      <Tooltip
        wrapperClassName="selected-account__tooltip-wrapper"
        position="bottom"
        title={copied ? t('copiedExclamation') : t('copyToClipboard')}
      >
        <div
          className="selected-account__clickable"
          onClick={() => {
            markCopied();
            copyToClipboard(checksummedAddress);
          }}
        >
          <div className="selected-account__name">{selectedIdentity.name}</div>
          <div className="selected-account__address">{checksummedAddress}</div>
        </div>
      </Tooltip>
    </div>
  );
}

SelectedAccount.propTypes = {
  selectedIdentity: PropTypes.object.isRequired,
};
