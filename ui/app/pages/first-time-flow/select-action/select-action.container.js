import { connect } from 'react-redux';
import { compose } from 'redux';

import Welcome from './select-action.component';
import withRouter from '../../../helpers/higher-order-components/with-router';
import { getFirstTimeFlowTypeRoute } from '../../../selectors';
import { setFirstTimeFlowType } from '../../../store/actions';

const mapStateToProps = (state) => {
  return {
    nextRoute: getFirstTimeFlowTypeRoute(state),
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    setFirstTimeFlowType: (type) => dispatch(setFirstTimeFlowType(type)),
  };
};

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(Welcome);
