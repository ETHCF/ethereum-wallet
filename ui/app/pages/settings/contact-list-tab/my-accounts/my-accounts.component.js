import React, { PureComponent } from 'react'
import PropTypes from 'prop-types'
import ContactList from '../../../../components/app/contact-list'
import { CONTACT_MY_ACCOUNTS_VIEW_ROUTE } from '../../../../helpers/constants/routes'

export default class ViewContact extends PureComponent {

  static contextTypes = {
    t: PropTypes.func,
  }

  static propTypes = {
    myAccounts: PropTypes.array,
    navigate: PropTypes.func,
  }

  renderMyAccounts () {
    const { myAccounts, navigate } = this.props

    return (
      <div>
        <ContactList
          searchForMyAccounts={() => myAccounts}
          selectRecipient={(address) => {
            navigate(`${CONTACT_MY_ACCOUNTS_VIEW_ROUTE}/${address}`)
          }}
        />
      </div>
    )
  }

  render () {
    return (
      <div className="address-book">
        { this.renderMyAccounts() }
      </div>
    )
  }
}
