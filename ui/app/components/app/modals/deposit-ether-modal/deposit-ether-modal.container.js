import { connect } from 'react-redux'
import { hideModal, showModal, hideWarning } from '../../../../store/actions'
import DepositEtherModal from './deposit-ether-modal.component'

function mapDispatchToProps (dispatch) {
  return {
    hideModal: () => {
      dispatch(hideModal())
    },
    hideWarning: () => {
      dispatch(hideWarning())
    },
    showAccountDetailModal: () => {
      dispatch(showModal({ name: 'ACCOUNT_DETAILS' }))
    },
  }
}

export default connect(null, mapDispatchToProps)(DepositEtherModal)
