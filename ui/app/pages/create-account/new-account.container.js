import { connect } from 'react-redux';

import NewAccountCreateForm from './new-account.component';
import { getMostRecentOverviewPage } from '../../ducks/history/history';
import withRouter from '../../helpers/higher-order-components/with-router';
import * as actions from '../../store/actions';

const mapStateToProps = (state) => {
  const {
    ecfWallet: { network, selectedAddress, identities = {} },
  } = state;
  const numberOfExistingAccounts = Object.keys(identities).length;
  const newAccountNumber = numberOfExistingAccounts + 1;

  return {
    network,
    address: selectedAddress,
    newAccountNumber,
    mostRecentOverviewPage: getMostRecentOverviewPage(state),
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    createAccount: (newAccountName) => {
      return dispatch(actions.addNewAccount()).then((newAccountAddress) => {
        if (newAccountName) {
          dispatch(actions.setAccountLabel(newAccountAddress, newAccountName));
        }
        return undefined;
      });
    },
  };
};

export default withRouter(
  connect(mapStateToProps, mapDispatchToProps)(NewAccountCreateForm),
);
