import { connect } from 'react-redux';

import ConfirmAddToken from './confirm-add-token.component';
import { getMostRecentOverviewPage } from '../../ducks/history/history';
import withRouter from '../../helpers/higher-order-components/with-router';
import { addTokens, clearPendingTokens } from '../../store/actions';

const mapStateToProps = (state) => {
  const {
    ecfWallet: { pendingTokens },
  } = state;
  return {
    mostRecentOverviewPage: getMostRecentOverviewPage(state),
    pendingTokens,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    addTokens: (tokens) => dispatch(addTokens(tokens)),
    clearPendingTokens: () => dispatch(clearPendingTokens()),
  };
};

export default withRouter(
  connect(mapStateToProps, mapDispatchToProps)(ConfirmAddToken),
);
