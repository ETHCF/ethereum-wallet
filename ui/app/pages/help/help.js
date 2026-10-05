import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

import { HELP_TOPICS } from '../../helpers/constants/help';
import { HELP_ROUTE } from '../../helpers/constants/routes';
import { useI18nContext } from '../../hooks/useI18nContext';

const DEFAULT_TOPIC = 'safety-tips';

// Help is plain text, so it needs no unlocked wallet and works during onboarding.
const Help = () => {
  const t = useI18nContext();
  const { topic } = useParams();
  const content = HELP_TOPICS[topic];

  if (!content) {
    return <Navigate to={`${HELP_ROUTE}/${DEFAULT_TOPIC}`} replace />;
  }
  return (
    <div className="main-container help">
      <h1 className="help__title">{t(content.title)}</h1>
      {content.paragraphs.map((key) => (
        <p key={key} className="help__paragraph">
          {t(key)}
        </p>
      ))}
      <h2 className="help__more">{t('helpMoreTopics')}</h2>
      <ul className="help__topics">
        {Object.entries(HELP_TOPICS)
          .filter(([key]) => key !== topic)
          .map(([key, { title }]) => (
            <li key={key}>
              <Link className="help__topic-link" to={`${HELP_ROUTE}/${key}`}>
                {t(title)}
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
};

export default Help;
