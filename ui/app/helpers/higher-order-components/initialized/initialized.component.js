import PropTypes from 'prop-types';
import React from 'react';
import { Navigate } from 'react-router-dom';

import { INITIALIZE_ROUTE } from '../../constants/routes';

// Renders its children once onboarding is complete.
export default function Initialized({ completedOnboarding, children }) {
  return completedOnboarding ? (
    children
  ) : (
    <Navigate to={INITIALIZE_ROUTE} replace />
  );
}

Initialized.propTypes = {
  completedOnboarding: PropTypes.bool,
  children: PropTypes.node,
};
