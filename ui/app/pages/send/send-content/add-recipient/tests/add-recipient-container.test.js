import assert from 'assert';
import proxyquire from 'proxyquire';

let mapStateToProps;

proxyquire('../add-recipient.container.js', {
  'react-redux': {
    connect: (ms) => {
      mapStateToProps = ms;
      return () => ({});
    },
  },
  '../../../../selectors': {
    getSendEnsResolution: (s) => `mockSendEnsResolution:${s}`,
    getSendEnsResolutionName: (s) => `mockSendEnsResolutionName:${s}`,
    getSendEnsResolutionError: (s) => `mockSendEnsResolutionError:${s}`,
    getAddressBook: (s) => [{ name: `mockAddressBook:${s}` }],
    getAddressBookEntry: (s) => `mockAddressBookEntry:${s}`,
    accountsWithSendEtherInfoSelector: (s) =>
      `mockAccountsWithSendEtherInfoSelector:${s}`,
  },
});

describe('add-recipient container', function () {
  describe('mapStateToProps()', function () {
    it('should map the correct properties to props', function () {
      assert.deepEqual(mapStateToProps('mockState'), {
        addressBook: [{ name: 'mockAddressBook:mockState' }],
        contacts: [{ name: 'mockAddressBook:mockState' }],
        ensResolution: 'mockSendEnsResolution:mockState',
        ensResolutionName: 'mockSendEnsResolutionName:mockState',
        ensResolutionError: 'mockSendEnsResolutionError:mockState',
        ownedAccounts: 'mockAccountsWithSendEtherInfoSelector:mockState',
        addressBookEntryName: undefined,
        nonContacts: [],
      });
    });
  });
});
