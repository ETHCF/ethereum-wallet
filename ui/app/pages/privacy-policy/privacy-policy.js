import React from 'react';

import LegalDocument from '../../components/app/legal-document';
import {
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
} from '../../helpers/constants/privacy-policy';
import { useI18nContext } from '../../hooks/useI18nContext';

const PrivacyPolicy = () => {
  const t = useI18nContext();
  return (
    <LegalDocument
      title={t('privacyMsg')}
      lastUpdated={PRIVACY_POLICY_LAST_UPDATED}
      sections={PRIVACY_POLICY_SECTIONS}
    />
  );
};

export default PrivacyPolicy;
