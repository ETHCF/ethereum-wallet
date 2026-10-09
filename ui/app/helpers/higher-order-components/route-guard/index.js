import PropTypes from 'prop-types';
import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';

import { UNLOCK_ROUTE, INITIALIZE_ROUTE } from '../../constants/routes';

/**
 * Renders its children once onboarding is complete and, when
 * `requireUnlocked` is set, the wallet is unlocked. Otherwise it redirects to
 * onboarding or to the unlock page.
 *
 * @param {object} props - The component props.
 * @param {boolean} [props.requireUnlocked] - Whether the wallet must be unlocked.
 * @param {React.ReactNode} props.children - The guarded content.
 * @returns {React.ReactNode} The children or a redirect.
 */
export default function RouteGuard({ requireUnlocked = false, children }) {
  const completedOnboarding = useSelector(
    (state) => state.ecfWallet.completedOnboarding,
  );
  const isUnlocked = useSelector((state) => state.ecfWallet.isUnlocked);

  if (!completedOnboarding) {
    return <Navigate to={INITIALIZE_ROUTE} replace />;
  }
  if (requireUnlocked && !isUnlocked) {
    return <Navigate to={UNLOCK_ROUTE} replace />;
  }
  return children;
}

RouteGuard.propTypes = {
  requireUnlocked: PropTypes.bool,
  children: PropTypes.node,
};
