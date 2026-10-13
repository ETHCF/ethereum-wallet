import React, { useContext } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { ENVIRONMENT_TYPE_POPUP } from '../../../../../app/scripts/lib/enums';
import { getEnvironmentType } from '../../../../../app/scripts/lib/util';
import { I18nContext } from '../../../contexts/i18n';
import { INITIALIZE_BACKUP_SEED_PHRASE_ROUTE } from '../../../helpers/constants/routes';

/**
 * A quiet reminder, at the foot of the asset list, for users who chose
 * "Remind me later" instead of backing up their seed phrase during onboarding.
 *
 * @returns {React.ReactElement|null} A link to the backup flow, or nothing
 * once the seed phrase has been backed up.
 */
export default function BackupReminder() {
  const t = useContext(I18nContext);
  const navigate = useNavigate();
  const seedPhraseBackedUp = useSelector(
    (state) => state.ecfWallet.seedPhraseBackedUp,
  );

  if (seedPhraseBackedUp !== false) {
    return null;
  }

  const onClick = () => {
    // The backup flow is a full page, so leave the popup for a tab.
    if (getEnvironmentType() === ENVIRONMENT_TYPE_POPUP) {
      global.platform.openExtensionInBrowser(
        INITIALIZE_BACKUP_SEED_PHRASE_ROUTE,
      );
    } else {
      navigate(INITIALIZE_BACKUP_SEED_PHRASE_ROUTE);
    }
  };

  return (
    <button
      className="backup-reminder"
      data-testid="backup-reminder"
      onClick={onClick}
    >
      {t('seedPhraseNotBackedUp')}
      <span className="backup-reminder__action">{t('backUpNow')}</span>
    </button>
  );
}
