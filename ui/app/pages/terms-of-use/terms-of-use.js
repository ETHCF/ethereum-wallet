import React from 'react'
import { useI18nContext } from '../../hooks/useI18nContext'
import {
  TERMS_OF_USE_LAST_UPDATED,
  TERMS_OF_USE_SECTIONS,
} from '../../helpers/constants/terms-of-use'

// The terms are plain text, so they need no unlocked wallet and can be read
// before agreeing to them during onboarding.
const TermsOfUse = () => {
  const t = useI18nContext()

  return (
    <div className="main-container terms-of-use">
      <h1 className="terms-of-use__title">{ t('terms') }</h1>
      <p className="terms-of-use__updated">{ t('termsOfUseLastUpdated', [TERMS_OF_USE_LAST_UPDATED]) }</p>
      { TERMS_OF_USE_SECTIONS.map(({ heading, paragraphs, items }) => (
        <section key={heading} className="terms-of-use__section">
          <h2 className="terms-of-use__heading">{ heading }</h2>
          { paragraphs.map((paragraph) => (
            <p key={paragraph} className="terms-of-use__paragraph">{ paragraph }</p>
          )) }
          { items && (
            <ul className="terms-of-use__list">
              { items.map((item) => <li key={item}>{ item }</li>) }
            </ul>
          ) }
        </section>
      )) }
    </div>
  )
}

export default TermsOfUse
