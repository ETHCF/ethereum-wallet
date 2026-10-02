import { connect } from 'react-redux'
import { getOnboardingInitiator } from '../../../selectors'
import withRouter from '../../../helpers/higher-order-components/with-router'
import EndOfFlow from './end-of-flow.component'

const mapStateToProps = (state) => {

  return {
    onboardingInitiator: getOnboardingInitiator(state),
  }
}

export default withRouter(connect(mapStateToProps)(EndOfFlow))
