import { connect } from 'react-redux';
import { compose } from 'redux';

import ConfirmAddSuggestedToken from './confirm-add-suggested-token.component';
import { getMostRecentOverviewPage } from '../../ducks/history/history';
import withRouter from '../../helpers/higher-order-components/with-router';
import { acceptWatchAsset, rejectWatchAsset } from '../../store/actions';

const mapStateToProps = (state) => {
  const {
    ecfWallet: { suggestedTokens = {}, tokens },
  } = state;
  // One suggestion at a time, oldest first, so each is answered on its own.
  const [suggestion] = Object.values(suggestedTokens).sort(
    (a, b) => a.time - b.time,
  );

  return {
    mostRecentOverviewPage: getMostRecentOverviewPage(state),
    suggestion,
    tokens,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    acceptWatchAsset: (id) => dispatch(acceptWatchAsset(id)),
    rejectWatchAsset: (id) => dispatch(rejectWatchAsset(id)),
  };
};

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(ConfirmAddSuggestedToken);
