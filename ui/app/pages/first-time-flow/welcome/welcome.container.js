import { connect } from 'react-redux';
import { compose } from 'redux';

import Welcome from './welcome.component';
import withRouter from '../../../helpers/higher-order-components/with-router';
import { closeWelcomeScreen } from '../../../store/actions';

const mapStateToProps = ({ ecfWallet }) => {
  const { welcomeScreenSeen } = ecfWallet;

  return {
    welcomeScreenSeen,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    closeWelcomeScreen: () => dispatch(closeWelcomeScreen()),
  };
};

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(Welcome);
