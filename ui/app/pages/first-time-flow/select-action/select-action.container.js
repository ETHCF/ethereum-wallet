import { connect } from 'react-redux'
import { compose } from 'redux'
import withRouter from '../../../helpers/higher-order-components/with-router'
import { setFirstTimeFlowType } from '../../../store/actions'
import { getFirstTimeFlowTypeRoute } from '../../../selectors'
import Welcome from './select-action.component'

const mapStateToProps = (state) => {
  return {
    nextRoute: getFirstTimeFlowTypeRoute(state),
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    setFirstTimeFlowType: (type) => dispatch(setFirstTimeFlowType(type)),
  }
}

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(Welcome)
