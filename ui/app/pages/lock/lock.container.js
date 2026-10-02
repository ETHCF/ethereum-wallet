import { compose } from 'redux'
import { connect } from 'react-redux'
import withRouter from '../../helpers/higher-order-components/with-router'
import { lockEcfWallet } from '../../store/actions'
import Lock from './lock.component'

const mapStateToProps = (state) => {
  const { ecfWallet: { isUnlocked } } = state

  return {
    isUnlocked,
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    lockEcfWallet: () => dispatch(lockEcfWallet()),
  }
}

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(Lock)
