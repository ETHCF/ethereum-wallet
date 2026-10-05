import { connect } from 'react-redux';

import AddToken from './add-token.component';
import { getMostRecentOverviewPage } from '../../ducks/history/history';
import withRouter from '../../helpers/higher-order-components/with-router';
import { setPendingTokens, clearPendingTokens } from '../../store/actions';

const mapStateToProps = (state) => {
  const {
    ecfWallet: { identities, tokens, pendingTokens },
  } = state;
  return {
    identities,
    mostRecentOverviewPage: getMostRecentOverviewPage(state),
    tokens,
    pendingTokens,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    setPendingTokens: (tokens) => dispatch(setPendingTokens(tokens)),
    clearPendingTokens: () => dispatch(clearPendingTokens()),
  };
};

export default withRouter(
  connect(mapStateToProps, mapDispatchToProps)(AddToken),
);
