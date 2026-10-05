import assert from 'assert';
import React from 'react';
import configureMockStore from 'redux-mock-store';
import { thunk } from 'redux-thunk';

import {
  BUILT_IN_NETWORKS,
  BUILT_IN_NETWORK_TYPES,
} from '../../../../../../app/scripts/controllers/network/enums';
import { mountWithRouter } from '../../../../../../test/lib/render-helpers';
import { DropdownMenuItem } from '../components/dropdown';
import NetworkDropdownIcon from '../components/network-dropdown-icon';
import NetworkDropdown from '../network-dropdown';

describe('Network Dropdown', function () {
  let wrapper;
  const createMockStore = configureMockStore([thunk]);

  describe('NetworkDropdown in appState is true', function () {
    const mockState = {
      ecfWallet: {
        network: '1',
        provider: {
          type: 'test',
        },
        frequentRpcListDetail: [{ rpcUrl: 'http://localhost:7545' }],
      },
      appState: {
        networkDropdownOpen: true,
      },
    };
    const store = createMockStore(mockState);

    beforeEach(function () {
      wrapper = mountWithRouter(<NetworkDropdown store={store} />);
    });

    const builtInCount = BUILT_IN_NETWORK_TYPES.length;

    it('renders every built-in network, localhost, the saved RPC and the custom RPC option', function () {
      assert.equal(wrapper.find(DropdownMenuItem).length, builtInCount + 3);
    });

    it('lists the built-in networks in order, mainnets before testnets, with their colors', function () {
      const names = wrapper
        .find('.network-name-item')
        .map((item) => item.text());
      const mainnets = BUILT_IN_NETWORK_TYPES.filter(
        (type) => !BUILT_IN_NETWORKS[type].testnet,
      );
      const testnets = BUILT_IN_NETWORK_TYPES.filter(
        (type) => BUILT_IN_NETWORKS[type].testnet,
      );
      const ordered = [...mainnets, ...testnets];
      assert.deepEqual(
        names.slice(0, builtInCount),
        ordered.map((type) => BUILT_IN_NETWORKS[type].name),
      );
      assert.equal(names[0], 'Ethereum Mainnet');
      ordered.forEach((type, index) => {
        assert.equal(
          wrapper.find(NetworkDropdownIcon).at(index).prop('backgroundColor'),
          BUILT_IN_NETWORKS[type].color,
        );
      });
    });

    it('shows localhost after the built-in networks', function () {
      assert.equal(
        wrapper.find(NetworkDropdownIcon).at(builtInCount).prop('innerBorder'),
        '1px solid var(--color-border-muted)',
      );
    });

    it('checks dropdown for frequestRPCList from  state ', function () {
      assert.equal(
        wrapper
          .find(DropdownMenuItem)
          .at(builtInCount + 1)
          .text(),
        '✓http://localhost:7545',
      );
    });

    it('shows the custom RPC option last', function () {
      assert.equal(
        wrapper
          .find(NetworkDropdownIcon)
          .at(builtInCount + 1)
          .prop('innerBorder'),
        '1px solid var(--color-border-muted)',
      );
    });
  });
});
