import classnames from 'classnames';
import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import { Route, Routes, matchPath } from 'react-router-dom';

import InfoTab from './info-tab';
import NetworksTab from './networks-tab';
import SecurityTab from './security-tab';
import SettingsTab from './settings-tab';
import TabBar from '../../components/app/tab-bar';
import {
  SECURITY_ROUTE,
  GENERAL_ROUTE,
  ABOUT_US_ROUTE,
  SETTINGS_ROUTE,
  NETWORKS_ROUTE,
} from '../../helpers/constants/routes';
import { toRelativeRoutePath } from '../../helpers/utils/routes.util';

class SettingsPage extends PureComponent {
  static propTypes = {
    backRoute: PropTypes.string,
    currentPath: PropTypes.string,
    navigate: PropTypes.func,
    isPopupView: PropTypes.bool,
    pathnameI18nKey: PropTypes.string,
    mostRecentOverviewPage: PropTypes.string.isRequired,
  };

  static contextTypes = {
    t: PropTypes.func,
  };

  render() {
    const { navigate, backRoute, currentPath, mostRecentOverviewPage } =
      this.props;

    return (
      <div
        className={classnames('main-container settings-page', {
          'settings-page--selected': currentPath !== SETTINGS_ROUTE,
        })}
      >
        <div className="settings-page__header">
          {currentPath !== SETTINGS_ROUTE && currentPath !== NETWORKS_ROUTE && (
            <div
              className="settings-page__back-button"
              onClick={() => navigate(backRoute)}
            />
          )}
          {this.renderTitle()}
          <div
            className="settings-page__close-button"
            onClick={() => navigate(mostRecentOverviewPage)}
          />
        </div>
        <div className="settings-page__content">
          <div className="settings-page__content__tabs">
            {this.renderTabs()}
          </div>
          <div className="settings-page__content__modules">
            {this.renderSubHeader()}
            {this.renderContent()}
          </div>
        </div>
      </div>
    );
  }

  renderTitle() {
    const { t } = this.context;
    const { isPopupView, pathnameI18nKey } = this.props;
    const titleText =
      isPopupView && pathnameI18nKey ? t(pathnameI18nKey) : t('settings');

    return <div className="settings-page__header__title">{titleText}</div>;
  }

  renderSubHeader() {
    const { t } = this.context;
    const { currentPath, pathnameI18nKey } = this.props;

    return (
      currentPath !== NETWORKS_ROUTE && (
        <div className="settings-page__subheader">
          <div>{t(pathnameI18nKey || 'general')}</div>
        </div>
      )
    );
  }

  renderTabs() {
    const { navigate, currentPath } = this.props;
    const { t } = this.context;

    return (
      <TabBar
        tabs={[
          { content: t('general'), key: GENERAL_ROUTE },
          { content: t('securityAndPrivacy'), key: SECURITY_ROUTE },
          { content: t('networks'), key: NETWORKS_ROUTE },
          { content: t('about'), key: ABOUT_US_ROUTE },
        ]}
        isActive={(key) => {
          if (key === GENERAL_ROUTE && currentPath === SETTINGS_ROUTE) {
            return true;
          }
          return matchPath(key, currentPath);
        }}
        onSelect={(key) => navigate(key)}
      />
    );
  }

  renderContent() {
    return (
      <Routes>
        <Route
          path={toRelativeRoutePath(ABOUT_US_ROUTE, SETTINGS_ROUTE)}
          element={<InfoTab />}
        />
        <Route
          path={toRelativeRoutePath(NETWORKS_ROUTE, SETTINGS_ROUTE)}
          element={<NetworksTab />}
        />
        <Route
          path={toRelativeRoutePath(SECURITY_ROUTE, SETTINGS_ROUTE)}
          element={<SecurityTab />}
        />
        <Route path="*" element={<SettingsTab />} />
      </Routes>
    );
  }
}

export default SettingsPage;
