import { connect } from 'react-redux'
import { withRouter } from 'react-router-dom'
import { compose } from 'redux'
import { closeWelcomeScreen } from '../../../store/actions'
import Welcome from './welcome.component'

const mapStateToProps = ({ ecfWallet }) => {
  const { welcomeScreenSeen } = ecfWallet

  return {
    welcomeScreenSeen,
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    closeWelcomeScreen: () => dispatch(closeWelcomeScreen()),
  }
}

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(Welcome)
