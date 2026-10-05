import { connect } from 'react-redux';
import { compose } from 'redux';

import UnlockPage from './unlock-page.component';
import { ENVIRONMENT_TYPE_POPUP } from '../../../../app/scripts/lib/enums';
import { getEnvironmentType } from '../../../../app/scripts/lib/util';
import {
  DEFAULT_ROUTE,
  RESTORE_VAULT_ROUTE,
} from '../../helpers/constants/routes';
import withRouter from '../../helpers/higher-order-components/with-router';
import {
  tryUnlockEcfWallet,
  forgotPassword,
  markPasswordForgotten,
  forceUpdateEcfWalletState,
} from '../../store/actions';

const mapStateToProps = (state) => {
  const {
    ecfWallet: { isUnlocked },
  } = state;
  return {
    isUnlocked,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    forgotPassword: () => dispatch(forgotPassword()),
    tryUnlockEcfWallet: (password) => dispatch(tryUnlockEcfWallet(password)),
    markPasswordForgotten: () => dispatch(markPasswordForgotten()),
    forceUpdateEcfWalletState: () => forceUpdateEcfWalletState(dispatch),
  };
};

const mergeProps = (stateProps, dispatchProps, ownProps) => {
  const { markPasswordForgotten, tryUnlockEcfWallet, ...restDispatchProps } =
    dispatchProps;
  const { navigate, onSubmit: ownPropsSubmit, ...restOwnProps } = ownProps;

  const onImport = async () => {
    await markPasswordForgotten();
    navigate(RESTORE_VAULT_ROUTE);

    if (getEnvironmentType() === ENVIRONMENT_TYPE_POPUP) {
      global.platform.openExtensionInBrowser(RESTORE_VAULT_ROUTE);
    }
  };

  const onSubmit = async (password) => {
    await tryUnlockEcfWallet(password);
    navigate(DEFAULT_ROUTE);
  };

  return {
    ...stateProps,
    ...restDispatchProps,
    ...restOwnProps,
    onImport,
    onRestore: onImport,
    onSubmit: ownPropsSubmit || onSubmit,
    navigate,
  };
};

export default compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps, mergeProps),
)(UnlockPage);
