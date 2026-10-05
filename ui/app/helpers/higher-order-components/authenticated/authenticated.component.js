import PropTypes from 'prop-types';
import React from 'react';
import { Navigate } from 'react-router-dom';

import { UNLOCK_ROUTE, INITIALIZE_ROUTE } from '../../constants/routes';

// Renders its children once onboarding is complete and the wallet is unlocked.
export default function Authenticated({
  isUnlocked,
  completedOnboarding,
  children,
}) {
  switch (true) {
    case isUnlocked && completedOnboarding:
      return children;
    case !completedOnboarding:
      return <Navigate to={INITIALIZE_ROUTE} replace />;
    default:
      return <Navigate to={UNLOCK_ROUTE} replace />;
  }
}

Authenticated.propTypes = {
  isUnlocked: PropTypes.bool,
  completedOnboarding: PropTypes.bool,
  children: PropTypes.node,
};
