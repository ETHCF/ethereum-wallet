import { connect } from 'react-redux';

import CreatePassword from './create-password.component';
import withRouter from '../../../helpers/higher-order-components/with-router';

const mapStateToProps = (state) => {
  const {
    ecfWallet: { isInitialized },
  } = state;

  return {
    isInitialized,
  };
};

export default withRouter(connect(mapStateToProps)(CreatePassword));
