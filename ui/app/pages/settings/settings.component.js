import React, { PureComponent } from 'react'
import PropTypes from 'prop-types'
import { Route, Routes, matchPath } from 'react-router-dom'
import classnames from 'classnames'
import TabBar from '../../components/app/tab-bar'
import {
  ALERTS_ROUTE,
  ADVANCED_ROUTE,
  SECURITY_ROUTE,
  GENERAL_ROUTE,
  ABOUT_US_ROUTE,
  SETTINGS_ROUTE,
  NETWORKS_ROUTE,
  CONTACT_LIST_ROUTE,
  CONTACT_ADD_ROUTE,
  CONTACT_EDIT_ROUTE,
  CONTACT_VIEW_ROUTE,
  CONTACT_MY_ACCOUNTS_ROUTE,
  CONTACT_MY_ACCOUNTS_VIEW_ROUTE,
  CONTACT_MY_ACCOUNTS_EDIT_ROUTE,
} from '../../helpers/constants/routes'
import { toRelativeRoutePath } from '../../helpers/utils/routes.util'
import SettingsTab from './settings-tab'
import AlertsTab from './alerts-tab'
import NetworksTab from './networks-tab'
import AdvancedTab from './advanced-tab'
import InfoTab from './info-tab'
import SecurityTab from './security-tab'
import ContactListTab from './contact-list-tab'

class SettingsPage extends PureComponent {
  static propTypes = {
    addressName: PropTypes.string,
    backRoute: PropTypes.string,
    currentPath: PropTypes.string,
    navigate: PropTypes.func,
    isAddressEntryPage: PropTypes.bool,
    isPopupView: PropTypes.bool,
    pathnameI18nKey: PropTypes.string,
    initialBreadCrumbRoute: PropTypes.string,
    breadCrumbTextKey: PropTypes.string,
    initialBreadCrumbKey: PropTypes.string,
    mostRecentOverviewPage: PropTypes.string.isRequired,
  }

  static contextTypes = {
    t: PropTypes.func,
  }

  render () {
    const { navigate, backRoute, currentPath, mostRecentOverviewPage } = this.props

    return (
      <div
        className={classnames('main-container settings-page', {
          'settings-page--selected': currentPath !== SETTINGS_ROUTE,
        })}
      >
        <div className="settings-page__header">
          {
            currentPath !== SETTINGS_ROUTE && currentPath !== NETWORKS_ROUTE && (
              <div
                className="settings-page__back-button"
                onClick={() => navigate(backRoute)}
              />
            )
          }
          { this.renderTitle() }
          <div
            className="settings-page__close-button"
            onClick={() => navigate(mostRecentOverviewPage)}
          />
        </div>
        <div className="settings-page__content">
          <div className="settings-page__content__tabs">
            { this.renderTabs() }
          </div>
          <div className="settings-page__content__modules">
            { this.renderSubHeader() }
            { this.renderContent() }
          </div>
        </div>
      </div>
    )
  }

  renderTitle () {
    const { t } = this.context
    const { isPopupView, pathnameI18nKey, addressName } = this.props

    let titleText

    if (isPopupView && addressName) {
      titleText = addressName
    } else if (pathnameI18nKey && isPopupView) {
      titleText = t(pathnameI18nKey)
    } else {
      titleText = t('settings')
    }

    return (
      <div className="settings-page__header__title">
        {titleText}
      </div>
    )
  }

  renderSubHeader () {
    const { t } = this.context
    const {
      currentPath,
      isPopupView,
      isAddressEntryPage,
      pathnameI18nKey,
      addressName,
      initialBreadCrumbRoute,
      breadCrumbTextKey,
      navigate,
      initialBreadCrumbKey,
    } = this.props

    let subheaderText

    if (isPopupView && isAddressEntryPage) {
      subheaderText = t('settings')
    } else if (initialBreadCrumbKey) {
      subheaderText = t(initialBreadCrumbKey)
    } else {
      subheaderText = t(pathnameI18nKey || 'general')
    }

    return currentPath !== NETWORKS_ROUTE && (
      <div className="settings-page__subheader">
        <div
          className={classnames({ 'settings-page__subheader--link': initialBreadCrumbRoute })}
          onClick={() => initialBreadCrumbRoute && navigate(initialBreadCrumbRoute)}
        >
          {subheaderText}
        </div>
        {breadCrumbTextKey && (
          <div className="settings-page__subheader--break">
            <span>{' > '}</span>{t(breadCrumbTextKey)}
          </div>
        )}
        {isAddressEntryPage && (
          <div className="settings-page__subheader--break">
            <span>{' > '}</span>{addressName}
          </div>
        )}
      </div>
    )
  }

  renderTabs () {
    const { navigate, currentPath } = this.props
    const { t } = this.context

    return (
      <TabBar
        tabs={[
          { content: t('general'), description: t('generalSettingsDescription'), key: GENERAL_ROUTE },
          { content: t('advanced'), description: t('advancedSettingsDescription'), key: ADVANCED_ROUTE },
          { content: t('contacts'), description: t('contactsSettingsDescription'), key: CONTACT_LIST_ROUTE },
          { content: t('securityAndPrivacy'), description: t('securitySettingsDescription'), key: SECURITY_ROUTE },
          { content: t('alerts'), description: t('alertsSettingsDescription'), key: ALERTS_ROUTE },
          { content: t('networks'), description: t('networkSettingsDescription'), key: NETWORKS_ROUTE },
          { content: t('about'), description: t('aboutSettingsDescription'), key: ABOUT_US_ROUTE },
        ]}
        isActive={(key) => {
          if (key === GENERAL_ROUTE && currentPath === SETTINGS_ROUTE) {
            return true
          }
          return matchPath(key, currentPath)
        }}
        onSelect={(key) => navigate(key)}
      />
    )
  }

  renderContent () {
    return (
      <Routes>
        <Route path={toRelativeRoutePath(GENERAL_ROUTE, SETTINGS_ROUTE)} element={<SettingsTab />} />
        <Route path={toRelativeRoutePath(ABOUT_US_ROUTE, SETTINGS_ROUTE)} element={<InfoTab />} />
        <Route path={toRelativeRoutePath(ADVANCED_ROUTE, SETTINGS_ROUTE)} element={<AdvancedTab />} />
        <Route path={toRelativeRoutePath(ALERTS_ROUTE, SETTINGS_ROUTE)} element={<AlertsTab />} />
        <Route path={toRelativeRoutePath(NETWORKS_ROUTE, SETTINGS_ROUTE)} element={<NetworksTab />} />
        <Route path={toRelativeRoutePath(SECURITY_ROUTE, SETTINGS_ROUTE)} element={<SecurityTab />} />
        <Route path={toRelativeRoutePath(CONTACT_LIST_ROUTE, SETTINGS_ROUTE)} element={<ContactListTab />} />
        <Route path={toRelativeRoutePath(CONTACT_ADD_ROUTE, SETTINGS_ROUTE)} element={<ContactListTab />} />
        <Route path={toRelativeRoutePath(CONTACT_MY_ACCOUNTS_ROUTE, SETTINGS_ROUTE)} element={<ContactListTab />} />
        <Route path={`${toRelativeRoutePath(CONTACT_EDIT_ROUTE, SETTINGS_ROUTE)}/:id`} element={<ContactListTab />} />
        <Route path={`${toRelativeRoutePath(CONTACT_VIEW_ROUTE, SETTINGS_ROUTE)}/:id`} element={<ContactListTab />} />
        <Route path={`${toRelativeRoutePath(CONTACT_MY_ACCOUNTS_VIEW_ROUTE, SETTINGS_ROUTE)}/:id`} element={<ContactListTab />} />
        <Route path={`${toRelativeRoutePath(CONTACT_MY_ACCOUNTS_EDIT_ROUTE, SETTINGS_ROUTE)}/:id`} element={<ContactListTab />} />
        <Route path="*" element={<SettingsTab />} />
      </Routes>
    )
  }
}

export default SettingsPage
