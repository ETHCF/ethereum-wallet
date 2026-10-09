import PropTypes from 'prop-types';
import React from 'react';

import RouteGuard from '../route-guard';

// Renders its children once onboarding is complete.
export default function Initialized({ children }) {
  return <RouteGuard>{children}</RouteGuard>;
}

Initialized.propTypes = {
  children: PropTypes.node,
};
