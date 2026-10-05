import { connect } from 'react-redux';
import { compose } from 'redux';

import ConfirmDeleteNetwork from './confirm-delete-network.component';
import withModalProps from '../../../../helpers/higher-order-components/with-modal-props';
import { delRpcTarget } from '../../../../store/actions';

const mapDispatchToProps = (dispatch) => {
  return {
    delRpcTarget: (target) => dispatch(delRpcTarget(target)),
  };
};

export default compose(
  withModalProps,
  connect(null, mapDispatchToProps),
)(ConfirmDeleteNetwork);
