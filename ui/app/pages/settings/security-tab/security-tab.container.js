import { connect } from 'react-redux';
import { compose } from 'redux';

import SecurityTab from './security-tab.component';
import withRouter from '../../../helpers/higher-order-components/with-router';
import { setUsePhishDetect } from '../../../store/actions';

const mapStateToProps = (state) => {
  const {
    appState: { warning },
    ecfWallet,
  } = state;
  const { usePhishDetect } = ecfWallet;

  return {
    warning,
    usePhishDetect,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    setUsePhishDetect: (val) => dispatch(setUsePhishDetect(val)),
  };
};

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(SecurityTab);
