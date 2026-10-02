import { connect } from 'react-redux'
import {
  getNativeCurrency,
  getSendMaxModeState,
} from '../../../selectors'
import CurrencyInput from './currency-input.component'

const mapStateToProps = (state) => ({
  nativeCurrency: getNativeCurrency(state),
  maxModeOn: getSendMaxModeState(state),
})

export default connect(mapStateToProps)(CurrencyInput)
