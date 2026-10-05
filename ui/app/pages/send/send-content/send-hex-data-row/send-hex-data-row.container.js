import { connect } from 'react-redux';

import SendHexDataRow from './send-hex-data-row.component';
import { updateSendHexData } from '../../../../store/actions';

export default connect(mapStateToProps, mapDispatchToProps)(SendHexDataRow);

function mapStateToProps(state) {
  return {
    data: state.ecfWallet.send.data,
  };
}

function mapDispatchToProps(dispatch) {
  return {
    updateSendHexData(data) {
      return dispatch(updateSendHexData(data));
    },
  };
}
