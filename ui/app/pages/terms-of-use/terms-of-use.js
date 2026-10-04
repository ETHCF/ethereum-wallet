import React from 'react'
import { useI18nContext } from '../../hooks/useI18nContext'
import LegalDocument from '../../components/app/legal-document'
import {
  TERMS_OF_USE_LAST_UPDATED,
  TERMS_OF_USE_SECTIONS,
} from '../../helpers/constants/terms-of-use'

const TermsOfUse = () => {
  const t = useI18nContext()
  return (
    <LegalDocument
      title={t('terms')}
      lastUpdated={TERMS_OF_USE_LAST_UPDATED}
      sections={TERMS_OF_USE_SECTIONS}
    />
  )
}

export default TermsOfUse
