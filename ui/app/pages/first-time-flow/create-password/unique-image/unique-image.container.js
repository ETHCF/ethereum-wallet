import { connect } from 'react-redux'
import UniqueImage from './unique-image.component'

const mapStateToProps = ({ ecfWallet }) => {
  const { selectedAddress } = ecfWallet

  return {
    address: selectedAddress,
  }
}

export default connect(mapStateToProps)(UniqueImage)
