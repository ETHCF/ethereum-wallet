import React, { PureComponent } from 'react'
import PropTypes from 'prop-types'
import Button from '../../../components/ui/button'
import Snackbar from '../../../components/ui/snackbar'
import MetaFoxLogo from '../../../components/ui/metafox-logo'
import { DEFAULT_ROUTE } from '../../../helpers/constants/routes'
import { getHelpUrl } from '../../../helpers/constants/help'
import { returnToOnboardingInitiator } from '../onboarding-initiator-util'

export default class EndOfFlowScreen extends PureComponent {
  static contextTypes = {
    t: PropTypes.func,
  }

  static propTypes = {
    history: PropTypes.object,
    onboardingInitiator: PropTypes.exact({
      location: PropTypes.string,
      tabId: PropTypes.number,
    }),
  }

  onComplete = async () => {
    const { history, onboardingInitiator } = this.props

    if (onboardingInitiator) {
      await returnToOnboardingInitiator(onboardingInitiator)
    }
    history.push(DEFAULT_ROUTE)
  }

  render () {
    const { t } = this.context
    const { onboardingInitiator } = this.props

    return (
      <div className="end-of-flow">
        <MetaFoxLogo />
        <div className="end-of-flow__emoji">🎉</div>
        <div className="first-time-flow__header">
          { t('congratulations') }
        </div>
        <div className="first-time-flow__text-block end-of-flow__text-1">
          { t('endOfFlowMessage1') }
        </div>
        <div className="first-time-flow__text-block end-of-flow__text-2">
          { t('endOfFlowMessage2') }
        </div>
        <div className="end-of-flow__text-3">
          { `• ${t('endOfFlowMessage3')}` }
        </div>
        <div className="end-of-flow__text-3">
          { `• ${t('endOfFlowMessage4')}` }
        </div>
        <div className="end-of-flow__text-3">
          { `• ${t('endOfFlowMessage5')}` }
        </div>
        <div className="end-of-flow__text-3">
          { `• ${t('endOfFlowMessage6')}` }
        </div>
        <div className="end-of-flow__text-3">
          { `• ${t('endOfFlowMessage7')}` }
        </div>
        <div className="first-time-flow__text-block end-of-flow__text-4">
          { `*${t('endOfFlowMessage8')}` }&nbsp;
          <a
            href={getHelpUrl('safety-tips')}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="first-time-flow__link-text">
              {t('endOfFlowMessage9')}
            </span>
          </a>
        </div>
        <Button
          type="primary"
          className="first-time-flow__button"
          onClick={this.onComplete}
        >
          { t('endOfFlowMessage10') }
        </Button>
        {
          onboardingInitiator ? (
            <Snackbar
              content={t('onboardingReturnNotice', [t('endOfFlowMessage10'), onboardingInitiator.location])}
            />
          ) : null
        }
      </div>
    )
  }
}
