import log from 'loglevel'
import PropTypes from 'prop-types'
import React, { Component } from 'react'

import { stripHexPrefix } from '@ethereumjs/util'
import { checksumAddress } from '../../../../helpers/utils/util'
import { useSensitiveClipboard } from '../../../../hooks/useSensitiveClipboard'
import ReadOnlyInput from '../../../ui/readonly-input'
import Button from '../../../ui/button'
import HoldToRevealButton from '../../../ui/hold-to-reveal-button'
import SensitiveClipboardNotice from '../../../ui/sensitive-clipboard-notice'
import AccountModalContainer from '../account-modal-container'

function PrivateKeyDisplay ({ privateKey }) {
  const [clipboardState, copy, clear] = useSensitiveClipboard()
  return (
    <>
      <ReadOnlyInput
        wrapperClass="export-private-key-modal__password-display-wrapper"
        inputClass="export-private-key-modal__password-display-textarea"
        textarea
        value={privateKey}
        onClick={() => copy(privateKey)}
      />
      <SensitiveClipboardNotice state={clipboardState} onClear={clear} />
    </>
  )
}

PrivateKeyDisplay.propTypes = {
  privateKey: PropTypes.string.isRequired,
}

export default class ExportPrivateKeyModal extends Component {
  static contextTypes = {
    t: PropTypes.func,
  }

  static defaultProps = {
    warning: null,
    previousModalState: null,
  }

  static propTypes = {
    exportAccount: PropTypes.func.isRequired,
    selectedIdentity: PropTypes.object.isRequired,
    warning: PropTypes.node,
    showAccountDetailModal: PropTypes.func.isRequired,
    hideModal: PropTypes.func.isRequired,
    clearAccountDetails: PropTypes.func.isRequired,
    previousModalState: PropTypes.string,
  }

  state = {
    password: '',
    privateKey: null,
    revealed: false,
    showWarning: true,
  }

  componentWillUnmount () {
    this.props.clearAccountDetails()
  }

  exportAccountAndGetPrivateKey = (password, address) => {
    const { exportAccount } = this.props

    exportAccount(password, address)
      .then((privateKey) => this.setState({
        privateKey,
        showWarning: false,
      }))
      .catch((e) => log.error(e))
  }

  renderPasswordLabel (privateKey) {
    return (
      <span className="export-private-key-modal__password-label">
        {
          privateKey
            ? this.context.t(this.state.revealed ? 'copyPrivateKey' : 'holdToRevealHint')
            : this.context.t('typePassword')
        }
      </span>
    )
  }

  renderPasswordInput (privateKey) {
    const plainKey = privateKey && stripHexPrefix(privateKey)

    if (!privateKey) {
      return (
        <input
          type="password"
          className="export-private-key-modal__password-input"
          onChange={(event) => this.setState({ password: event.target.value })}
        />
      )
    }

    if (!this.state.revealed) {
      return (
        <HoldToRevealButton
          buttonText={this.context.t('holdToRevealPrivateKey')}
          onLongPressed={() => this.setState({ revealed: true })}
        />
      )
    }

    return <PrivateKeyDisplay privateKey={plainKey} />
  }

  renderButtons (privateKey, address, hideModal) {
    return (
      <div className="export-private-key-modal__buttons">
        {!privateKey && (
          <Button
            type="default"
            large
            className="export-private-key-modal__button export-private-key-modal__button--cancel"
            onClick={() => hideModal()}
          >
            {this.context.t('cancel')}
          </Button>
        )}
        {
          privateKey
            ? (
              <Button
                onClick={() => hideModal()}
                type="secondary"
                large
                className="export-private-key-modal__button"
              >
                {this.context.t('done')}
              </Button>
            )
            : (
              <Button
                onClick={() => this.exportAccountAndGetPrivateKey(this.state.password, address)}
                type="secondary"
                large
                className="export-private-key-modal__button"
                disabled={!this.state.password}
              >
                {this.context.t('confirm')}
              </Button>
            )
        }
      </div>
    )
  }

  render () {
    const {
      selectedIdentity,
      warning,
      showAccountDetailModal,
      hideModal,
      previousModalState,
    } = this.props
    const { name, address } = selectedIdentity

    const {
      privateKey,
      showWarning,
    } = this.state

    return (
      <AccountModalContainer
        className="export-private-key-modal"
        selectedIdentity={selectedIdentity}
        showBackButton={previousModalState === 'ACCOUNT_DETAILS'}
        backButtonAction={() => showAccountDetailModal()}
      >
        <span className="export-private-key-modal__account-name">{name}</span>
        <ReadOnlyInput
          wrapperClass="ellip-address-wrapper"
          value={checksumAddress(address)}
        />
        <div className="export-private-key-modal__divider" />
        <span className="export-private-key-modal__body-title">{this.context.t('showPrivateKeys')}</span>
        <div className="export-private-key-modal__password">
          {this.renderPasswordLabel(privateKey)}
          {this.renderPasswordInput(privateKey)}
          {
            (showWarning && warning)
              ? <span className="export-private-key-modal__password--error">{warning}</span>
              : null
          }
        </div>
        <div className="export-private-key-modal__password--warning">{this.context.t('privateKeyWarning')}</div>
        {this.renderButtons(privateKey, address, hideModal)}
      </AccountModalContainer>
    )
  }
}
