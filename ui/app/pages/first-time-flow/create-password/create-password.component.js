import React, { PureComponent } from 'react'
import PropTypes from 'prop-types'
import { Route, Routes } from 'react-router-dom'
import MetaFoxLogo from '../../../components/ui/metafox-logo'
import {
  INITIALIZE_CREATE_PASSWORD_ROUTE,
  INITIALIZE_IMPORT_WITH_SEED_PHRASE_ROUTE,
  INITIALIZE_SEED_PHRASE_ROUTE,
} from '../../../helpers/constants/routes'
import { toRelativeRoutePath } from '../../../helpers/utils/routes.util'
import NewAccount from './new-account'
import ImportWithSeedPhrase from './import-with-seed-phrase'

export default class CreatePassword extends PureComponent {
  static propTypes = {
    navigate: PropTypes.func,
    isInitialized: PropTypes.bool,
    onCreateNewAccount: PropTypes.func,
    onCreateNewAccountFromSeed: PropTypes.func,
  }

  componentDidMount () {
    const { isInitialized, navigate } = this.props

    if (isInitialized) {
      navigate(INITIALIZE_SEED_PHRASE_ROUTE)
    }
  }

  render () {
    const { onCreateNewAccount, onCreateNewAccountFromSeed } = this.props

    return (
      <div className="first-time-flow__wrapper">
        <MetaFoxLogo />
        <Routes>
          <Route
            path={toRelativeRoutePath(INITIALIZE_IMPORT_WITH_SEED_PHRASE_ROUTE, INITIALIZE_CREATE_PASSWORD_ROUTE)}
            element={(
              <ImportWithSeedPhrase
                onSubmit={onCreateNewAccountFromSeed}
              />
            )}
          />
          <Route
            path={toRelativeRoutePath(INITIALIZE_CREATE_PASSWORD_ROUTE, INITIALIZE_CREATE_PASSWORD_ROUTE)}
            element={(
              <NewAccount
                onSubmit={onCreateNewAccount}
              />
            )}
          />
        </Routes>
      </div>
    )
  }
}
