import { connect } from 'react-redux'
import withRouter from '../../../helpers/higher-order-components/with-router'
import CreatePassword from './create-password.component'

const mapStateToProps = (state) => {
  const { ecfWallet: { isInitialized } } = state

  return {
    isInitialized,
  }
}

export default withRouter(connect(mapStateToProps)(CreatePassword))
