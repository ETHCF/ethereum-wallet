import { connect } from 'react-redux';
import { compose } from 'redux';

import Settings from './settings.component';
import { ENVIRONMENT_TYPE_POPUP } from '../../../../app/scripts/lib/enums';
import { getEnvironmentType } from '../../../../app/scripts/lib/util';
import { getMostRecentOverviewPage } from '../../ducks/history/history';
import {
  CONNECTIONS_ROUTE,
  SECURITY_ROUTE,
  GENERAL_ROUTE,
  ABOUT_US_ROUTE,
  SETTINGS_ROUTE,
} from '../../helpers/constants/routes';
import withRouter from '../../helpers/higher-order-components/with-router';

const ROUTES_TO_I18N_KEYS = {
  [GENERAL_ROUTE]: 'general',
  [CONNECTIONS_ROUTE]: 'connections',
  [SECURITY_ROUTE]: 'securityAndPrivacy',
  [ABOUT_US_ROUTE]: 'about',
};

const mapStateToProps = (state, ownProps) => {
  const { pathname } = ownProps.location;

  return {
    backRoute: SETTINGS_ROUTE,
    currentPath: pathname,
    isPopupView: getEnvironmentType() === ENVIRONMENT_TYPE_POPUP,
    pathnameI18nKey: ROUTES_TO_I18N_KEYS[pathname],
    mostRecentOverviewPage: getMostRecentOverviewPage(state),
  };
};

export default compose(withRouter, connect(mapStateToProps))(Settings);
