import React, { PureComponent } from 'react'
import PropTypes from 'prop-types'
import { Route, Routes } from 'react-router-dom'
import {
  INITIALIZE_SEED_PHRASE_ROUTE,
  INITIALIZE_CONFIRM_SEED_PHRASE_ROUTE,
  DEFAULT_ROUTE,
} from '../../../helpers/constants/routes'
import MetaFoxLogo from '../../../components/ui/metafox-logo'
import { toRelativeRoutePath } from '../../../helpers/utils/routes.util'
import ConfirmSeedPhrase from './confirm-seed-phrase'
import RevealSeedPhrase from './reveal-seed-phrase'

export default class SeedPhrase extends PureComponent {
  static propTypes = {
    navigate: PropTypes.func,
    seedPhrase: PropTypes.string,
    verifySeedPhrase: PropTypes.func,
  }

  state = {
    verifiedSeedPhrase: '',
  }

  componentDidMount () {
    const { seedPhrase, navigate, verifySeedPhrase } = this.props

    if (!seedPhrase) {
      verifySeedPhrase()
        .then((verifiedSeedPhrase) => {
          if (verifiedSeedPhrase) {
            this.setState({ verifiedSeedPhrase })
          } else {
            navigate(DEFAULT_ROUTE)
          }
        })
    }
  }

  render () {
    const { seedPhrase } = this.props
    const { verifiedSeedPhrase } = this.state

    return (
      <div className="first-time-flow__wrapper">
        <MetaFoxLogo />
        <Routes>
          <Route
            path={toRelativeRoutePath(INITIALIZE_CONFIRM_SEED_PHRASE_ROUTE, INITIALIZE_SEED_PHRASE_ROUTE)}
            element={(
              <ConfirmSeedPhrase
                seedPhrase={seedPhrase || verifiedSeedPhrase}
              />
            )}
          />
          <Route
            path={toRelativeRoutePath(INITIALIZE_SEED_PHRASE_ROUTE, INITIALIZE_SEED_PHRASE_ROUTE)}
            element={(
              <RevealSeedPhrase
                seedPhrase={seedPhrase || verifiedSeedPhrase}
              />
            )}
          />
        </Routes>
      </div>
    )
  }
}
