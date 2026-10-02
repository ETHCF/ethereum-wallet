import { connect } from 'react-redux'
import { getNativeCurrencyImage } from '../../../selectors'
import Identicon from './identicon.component'

const mapStateToProps = (state) => {
  const { ecfWallet: { useBlockie } } = state

  return {
    useBlockie,
    nativeCurrencyImage: getNativeCurrencyImage(state),
  }
}

export default connect(mapStateToProps)(Identicon)
