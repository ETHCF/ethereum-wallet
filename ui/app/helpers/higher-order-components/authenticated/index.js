import PropTypes from 'prop-types';
import React from 'react';

import RouteGuard from '../route-guard';

// Renders its children once onboarding is complete and the wallet is unlocked.
export default function Authenticated({ children }) {
  return <RouteGuard requireUnlocked>{children}</RouteGuard>;
}

Authenticated.propTypes = {
  children: PropTypes.node,
};
