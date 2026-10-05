import { connect } from 'react-redux';

import CurrencyInput from './currency-input.component';
import { getNativeCurrency, getSendMaxModeState } from '../../../selectors';

const mapStateToProps = (state) => ({
  nativeCurrency: getNativeCurrency(state),
  maxModeOn: getSendMaxModeState(state),
});

export default connect(mapStateToProps)(CurrencyInput);
