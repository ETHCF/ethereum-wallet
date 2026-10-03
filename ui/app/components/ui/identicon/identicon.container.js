import { connect } from 'react-redux'
import { getNativeCurrencyImage } from '../../../selectors'
import Identicon from './identicon.component'

const mapStateToProps = (state) => {

  return {
    nativeCurrencyImage: getNativeCurrencyImage(state),
  }
}

export default connect(mapStateToProps)(Identicon)
