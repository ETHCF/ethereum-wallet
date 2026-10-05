import { connect } from 'react-redux';
import { compose } from 'redux';

import AdvancedTab from './advanced-tab.component';
import withRouter from '../../../helpers/higher-order-components/with-router';
import { getPreferences } from '../../../selectors';
import { setAutoLockTimeLimit } from '../../../store/actions';

export const mapStateToProps = (state) => {
  const { autoLockTimeLimit } = getPreferences(state);

  return { autoLockTimeLimit };
};

export const mapDispatchToProps = (dispatch) => {
  return {
    setAutoLockTimeLimit: (value) => dispatch(setAutoLockTimeLimit(value)),
  };
};

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(AdvancedTab);
