import { connect } from 'react-redux';

import PermissionPageContainer from './permission-page-container.component';
import { getEcfWalletIdentities } from '../../../selectors';

const mapStateToProps = (state, ownProps) => {
  const { selectedIdentities } = ownProps;

  const allIdentities = getEcfWalletIdentities(state);
  const allIdentitiesSelected =
    Object.keys(selectedIdentities).length ===
      Object.keys(allIdentities).length && selectedIdentities.length > 1;

  return {
    allIdentitiesSelected,
  };
};

export default connect(mapStateToProps)(PermissionPageContainer);
