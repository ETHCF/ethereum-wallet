import { compose } from 'redux'
import { connect } from 'react-redux'
import withRouter from '../../../helpers/higher-order-components/with-router'
import { setAutoLockTimeLimit } from '../../../store/actions'
import { getPreferences } from '../../../selectors'
import AdvancedTab from './advanced-tab.component'

export const mapStateToProps = (state) => {
  const { autoLockTimeLimit } = getPreferences(state)

  return { autoLockTimeLimit }
}

export const mapDispatchToProps = (dispatch) => {
  return {
    setAutoLockTimeLimit: (value) => dispatch(setAutoLockTimeLimit(value)),
  }
}

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(AdvancedTab)
