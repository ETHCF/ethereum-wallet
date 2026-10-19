import Fuse from 'fuse.js';
import PropTypes from 'prop-types';
import React, { Component } from 'react';

import ContactList from '../../../../components/app/contact-list';
import RecipientGroup from '../../../../components/app/contact-list/recipient-group/recipient-group.component';
import Button from '../../../../components/ui/button';
import Dialog from '../../../../components/ui/dialog';
import Identicon from '../../../../components/ui/identicon';
import { isValidAddress } from '../../../../helpers/utils/util';

export default class AddRecipient extends Component {
  static propTypes = {
    query: PropTypes.string,
    ownedAccounts: PropTypes.array,
    addressBook: PropTypes.array,
    updateGas: PropTypes.func,
    updateSendTo: PropTypes.func,
    ensResolution: PropTypes.string,
    ensResolutionName: PropTypes.string,
    toError: PropTypes.string,
    toWarning: PropTypes.string,
    ensResolutionError: PropTypes.string,
    addressBookEntryName: PropTypes.string,
    contacts: PropTypes.array,
    nonContacts: PropTypes.array,
  };

  constructor(props) {
    super(props);
    this.recentFuse = new Fuse(props.nonContacts, {
      shouldSort: true,
      threshold: 0.45,
      location: 0,
      distance: 100,
      minMatchCharLength: 1,
      keys: [{ name: 'address', weight: 0.5 }],
    });

    this.contactFuse = new Fuse(props.contacts, {
      shouldSort: true,
      threshold: 0.45,
      location: 0,
      distance: 100,
      minMatchCharLength: 1,
      keys: [
        { name: 'name', weight: 0.5 },
        { name: 'address', weight: 0.5 },
      ],
    });
  }

  static contextTypes = {
    t: PropTypes.func,
  };

  state = {
    isShowingTransfer: false,
  };

  selectRecipient = (to, nickname = '') => {
    const { updateSendTo, updateGas } = this.props;

    updateSendTo(to, nickname);
    updateGas({ to });
  };

  searchForContacts = () => {
    const { query, contacts } = this.props;

    let _contacts = contacts;

    if (query) {
      this.contactFuse.setCollection(contacts);
      _contacts = this.contactFuse.search(query).map(({ item }) => item);
    }

    return _contacts;
  };

  searchForRecents = () => {
    const { query, nonContacts } = this.props;

    let _nonContacts = nonContacts;

    if (query) {
      this.recentFuse.setCollection(nonContacts);
      _nonContacts = this.recentFuse.search(query).map(({ item }) => item);
    }

    return _nonContacts;
  };

  render() {
    const { ensResolution, ensResolutionName, query, addressBookEntryName } =
      this.props;
    const { isShowingTransfer } = this.state;

    let content;

    if (isValidAddress(query)) {
      content = this.renderExplicitAddress(query);
    } else if (ensResolution) {
      // Label the address with the name that resolved to it, not the text
      // typed, which can look like a different name.
      content = this.renderExplicitAddress(
        ensResolution,
        addressBookEntryName || ensResolutionName,
      );
    } else if (isShowingTransfer) {
      content = this.renderTransfer();
    }

    return (
      <div className="send__select-recipient-wrapper">
        {this.renderDialogs()}
        {content || this.renderMain()}
      </div>
    );
  }

  renderExplicitAddress(address, name) {
    return (
      <div
        key={address}
        className="send__select-recipient-wrapper__group-item"
        onClick={() => this.selectRecipient(address, name)}
      >
        <Identicon address={address} diameter={28} />
        <div className="send__select-recipient-wrapper__group-item__content">
          <div className="send__select-recipient-wrapper__group-item__title">
            {name || address}
          </div>
          {name && (
            <div className="send__select-recipient-wrapper__group-item__subtitle">
              {address}
            </div>
          )}
        </div>
      </div>
    );
  }

  renderTransfer() {
    const { ownedAccounts } = this.props;
    const { t } = this.context;

    return (
      <div className="send__select-recipient-wrapper__list">
        <Button
          type="link"
          className="send__select-recipient-wrapper__list__link"
          onClick={() => this.setState({ isShowingTransfer: false })}
        >
          <div className="send__select-recipient-wrapper__list__back-caret" />
          {t('backToAll')}
        </Button>
        <RecipientGroup
          label={t('myAccounts')}
          items={ownedAccounts}
          onSelect={this.selectRecipient}
        />
      </div>
    );
  }

  renderMain() {
    const { t } = this.context;
    const { query, ownedAccounts = [], addressBook } = this.props;

    return (
      <div className="send__select-recipient-wrapper__list">
        <ContactList
          addressBook={addressBook}
          searchForContacts={this.searchForContacts.bind(this)}
          searchForRecents={this.searchForRecents.bind(this)}
          selectRecipient={this.selectRecipient.bind(this)}
        >
          {ownedAccounts && ownedAccounts.length > 1 && !query && (
            <Button
              type="link"
              className="send__select-recipient-wrapper__list__link"
              onClick={() => this.setState({ isShowingTransfer: true })}
            >
              {t('transferBetweenAccounts')}
            </Button>
          )}
        </ContactList>
      </div>
    );
  }

  renderDialogs() {
    const {
      toError,
      toWarning,
      ensResolutionError,
      ensResolution,
      ensResolutionName,
      query,
    } = this.props;
    const { t } = this.context;

    // ENS maps some characters to others (paypaI.eth, with a capital I,
    // resolves paypai.eth), so a typed name can look like one it is not.
    // Shown even when contacts match, since a lookalike of a contact's name
    // would match that contact.
    if (
      ensResolution &&
      ensResolutionName &&
      query?.trim() !== ensResolutionName
    ) {
      return (
        <Dialog type="warning" className="send__error-dialog">
          {t('ensNameDiffersFromInput', [query.trim(), ensResolutionName])}
        </Dialog>
      );
    }

    const contacts = this.searchForContacts();
    const recents = this.searchForRecents();

    if (contacts.length || recents.length) {
      return null;
    }

    if (ensResolutionError) {
      return (
        <Dialog type="error" className="send__error-dialog">
          {ensResolutionError}
        </Dialog>
      );
    }

    if (toError && toError !== 'required' && !ensResolution) {
      return (
        <Dialog type="error" className="send__error-dialog">
          {t(toError)}
        </Dialog>
      );
    }

    if (toWarning) {
      return (
        <Dialog type="warning" className="send__error-dialog">
          {t(toWarning)}
        </Dialog>
      );
    }

    return null;
  }
}
