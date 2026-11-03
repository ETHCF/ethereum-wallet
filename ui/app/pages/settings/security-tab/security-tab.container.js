import { connect } from 'react-redux';
import { compose } from 'redux';

import SecurityTab from './security-tab.component';
import withRouter from '../../../helpers/higher-order-components/with-router';
import {
  changePassword,
  setDisplayNftMedia,
  setRejectRequestsOnClose,
  setUse4ByteResolution,
  setUpdatePhishingList,
  setUseNftDetection,
  setUsePhishDetect,
} from '../../../store/actions';

const mapStateToProps = (state) => {
  const {
    appState: { warning },
    ecfWallet,
  } = state;
  const {
    usePhishDetect,
    updatePhishingList,
    use4ByteResolution,
    rejectRequestsOnClose,
    useNftDetection,
    displayNftMedia,
  } = ecfWallet;

  return {
    warning,
    usePhishDetect,
    updatePhishingList: updatePhishingList !== false,
    use4ByteResolution: use4ByteResolution !== false,
    rejectRequestsOnClose: rejectRequestsOnClose !== false,
    // Both contact third parties, so both are off unless turned on.
    useNftDetection: useNftDetection === true,
    displayNftMedia: displayNftMedia === true,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    setUsePhishDetect: (val) => dispatch(setUsePhishDetect(val)),
    setUpdatePhishingList: (val) => dispatch(setUpdatePhishingList(val)),
    setUse4ByteResolution: (val) => dispatch(setUse4ByteResolution(val)),
    setRejectRequestsOnClose: (val) => dispatch(setRejectRequestsOnClose(val)),
    setUseNftDetection: (val) => dispatch(setUseNftDetection(val)),
    setDisplayNftMedia: (val) => dispatch(setDisplayNftMedia(val)),
    changePassword: (oldPassword, newPassword) =>
      dispatch(changePassword(oldPassword, newPassword)),
  };
};

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(SecurityTab);
