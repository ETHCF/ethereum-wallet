import React from 'react'
import PropTypes from 'prop-types'
import { useI18nContext } from '../../../hooks/useI18nContext'

// Legal documents are plain text, so their pages need no unlocked wallet and
// can be read before agreeing to them during onboarding.
const LegalDocument = ({ title, lastUpdated, sections }) => {
  const t = useI18nContext()

  return (
    <div className="main-container legal-document">
      <h1 className="legal-document__title">{ title }</h1>
      <p className="legal-document__updated">{ t('legalLastUpdated', [lastUpdated]) }</p>
      { sections.map(({ heading, paragraphs, items }) => (
        <section key={heading} className="legal-document__section">
          <h2 className="legal-document__heading">{ heading }</h2>
          { paragraphs.map((paragraph) => (
            <p key={paragraph} className="legal-document__paragraph">{ paragraph }</p>
          )) }
          { items && (
            <ul className="legal-document__list">
              { items.map((item) => <li key={item}>{ item }</li>) }
            </ul>
          ) }
        </section>
      )) }
    </div>
  )
}

LegalDocument.propTypes = {
  title: PropTypes.string.isRequired,
  lastUpdated: PropTypes.string.isRequired,
  sections: PropTypes.arrayOf(PropTypes.shape({
    heading: PropTypes.string.isRequired,
    paragraphs: PropTypes.arrayOf(PropTypes.string).isRequired,
    items: PropTypes.arrayOf(PropTypes.string),
  })).isRequired,
}

export default LegalDocument
