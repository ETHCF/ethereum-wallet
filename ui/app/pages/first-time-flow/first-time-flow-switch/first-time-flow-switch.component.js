import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import { Navigate } from 'react-router-dom';

import {
  DEFAULT_ROUTE,
  LOCK_ROUTE,
  INITIALIZE_WELCOME_ROUTE,
  INITIALIZE_UNLOCK_ROUTE,
} from '../../../helpers/constants/routes';

export default class FirstTimeFlowSwitch extends PureComponent {
  static propTypes = {
    completedOnboarding: PropTypes.bool,
    isInitialized: PropTypes.bool,
    isUnlocked: PropTypes.bool,
  };

  render() {
    const { completedOnboarding, isInitialized, isUnlocked } = this.props;

    if (completedOnboarding) {
      return <Navigate to={DEFAULT_ROUTE} replace />;
    }

    if (isUnlocked) {
      return <Navigate to={LOCK_ROUTE} replace />;
    }

    if (!isInitialized) {
      return <Navigate to={INITIALIZE_WELCOME_ROUTE} replace />;
    }

    if (!isUnlocked) {
      return <Navigate to={INITIALIZE_UNLOCK_ROUTE} replace />;
    }

    return <Navigate to={INITIALIZE_WELCOME_ROUTE} replace />;
  }
}
