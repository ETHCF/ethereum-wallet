import { connect } from 'react-redux';

import EnsInput from './ens-input.component';
import {
  getCurrentNetwork,
  getSendTo,
  getSendToNickname,
  getAddressBookEntry,
} from '../../../../selectors';
import { resolveEnsName } from '../../../../store/actions';

export default connect(
  (state) => {
    const selectedAddress = getSendTo(state);
    return {
      network: getCurrentNetwork(state),
      selectedAddress,
      selectedName: getSendToNickname(state),
      contact: getAddressBookEntry(state, selectedAddress),
    };
  },
  // Resolving goes to the background and changes no state here.
  () => ({ resolveEnsName }),
)(EnsInput);
