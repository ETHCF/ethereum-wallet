import { connect } from 'react-redux';

import Identicon from './identicon.component';
import { getNativeCurrencyImage } from '../../../selectors';

const mapStateToProps = (state) => {
  return {
    nativeCurrencyImage: getNativeCurrencyImage(state),
  };
};

export default connect(mapStateToProps)(Identicon);
