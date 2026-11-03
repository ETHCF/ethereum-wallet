import classnames from 'classnames';
import PropTypes from 'prop-types';
import React, { Component } from 'react';
import { Route, Routes, matchPath } from 'react-router-dom';

import ConnectHardware from './connect-hardware';
import NewAccountImportForm from './import-account';
import NewAccountCreateForm from './new-account.container';
import {
  NEW_ACCOUNT_ROUTE,
  IMPORT_ACCOUNT_ROUTE,
  CONNECT_HARDWARE_ROUTE,
} from '../../helpers/constants/routes';
import { toRelativeRoutePath } from '../../helpers/utils/routes.util';

export default class CreateAccountPage extends Component {
  renderTabs() {
    const {
      navigate,
      location: { pathname },
    } = this.props;
    const getClassNames = (path) =>
      classnames('new-account__tabs__tab', {
        'new-account__tabs__selected': matchPath(path, pathname),
      });

    return (
      <div className="new-account__tabs">
        <div
          className={getClassNames(NEW_ACCOUNT_ROUTE)}
          onClick={() => navigate(NEW_ACCOUNT_ROUTE)}
        >
          {this.context.t('create')}
        </div>
        <div
          className={getClassNames(IMPORT_ACCOUNT_ROUTE)}
          onClick={() => navigate(IMPORT_ACCOUNT_ROUTE)}
        >
          {this.context.t('import')}
        </div>
        <div
          className={getClassNames(CONNECT_HARDWARE_ROUTE)}
          onClick={() => navigate(CONNECT_HARDWARE_ROUTE)}
        >
          {this.context.t('hardware')}
        </div>
      </div>
    );
  }

  render() {
    return (
      <div className="new-account">
        <div className="new-account__header">
          <div
            className={`new-account__header ${this.context.t('newAccount')}`}
          >
            {this.renderTabs()}
          </div>
        </div>
        <div className="new-account__form">
          <Routes>
            <Route
              path={toRelativeRoutePath(NEW_ACCOUNT_ROUTE, NEW_ACCOUNT_ROUTE)}
              element={<NewAccountCreateForm />}
            />
            <Route
              path={toRelativeRoutePath(
                IMPORT_ACCOUNT_ROUTE,
                NEW_ACCOUNT_ROUTE,
              )}
              element={<NewAccountImportForm />}
            />
            <Route
              path={toRelativeRoutePath(
                CONNECT_HARDWARE_ROUTE,
                NEW_ACCOUNT_ROUTE,
              )}
              element={<ConnectHardware />}
            />
          </Routes>
        </div>
      </div>
    );
  }
}

CreateAccountPage.propTypes = {
  location: PropTypes.object,
  navigate: PropTypes.func,
};

CreateAccountPage.contextTypes = {
  t: PropTypes.func,
};
