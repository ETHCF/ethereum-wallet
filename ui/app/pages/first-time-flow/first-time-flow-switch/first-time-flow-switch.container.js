import { connect } from 'react-redux'
import FirstTimeFlowSwitch from './first-time-flow-switch.component'

const mapStateToProps = ({ ecfWallet }) => {
  const {
    completedOnboarding,
    isInitialized,
    isUnlocked,
  } = ecfWallet

  return {
    completedOnboarding,
    isInitialized,
    isUnlocked,
  }
}

export default connect(mapStateToProps)(FirstTimeFlowSwitch)
