import { connect } from 'react-redux';
import { compose } from 'redux';

import Lock from './lock.component';
import withRouter from '../../helpers/higher-order-components/with-router';
import { lockEcfWallet } from '../../store/actions';

const mapStateToProps = (state) => {
  const {
    ecfWallet: { isUnlocked },
  } = state;

  return {
    isUnlocked,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    lockEcfWallet: () => dispatch(lockEcfWallet()),
  };
};

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(Lock);
