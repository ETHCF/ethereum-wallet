import { connect } from 'react-redux';
import { compose } from 'redux';

import SecurityTab from './security-tab.component';
import withRouter from '../../../helpers/higher-order-components/with-router';
import {
  setUse4ByteResolution,
  setUsePhishDetect,
} from '../../../store/actions';

const mapStateToProps = (state) => {
  const {
    appState: { warning },
    ecfWallet,
  } = state;
  const { usePhishDetect, use4ByteResolution } = ecfWallet;

  return {
    warning,
    usePhishDetect,
    use4ByteResolution: use4ByteResolution !== false,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    setUsePhishDetect: (val) => dispatch(setUsePhishDetect(val)),
    setUse4ByteResolution: (val) => dispatch(setUse4ByteResolution(val)),
  };
};

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(SecurityTab);
