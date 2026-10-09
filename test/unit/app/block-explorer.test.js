import { strict as assert } from 'assert';

import {
  getAddressExplorerUrl,
  getTxExplorerUrl,
} from '../../../app/scripts/lib/block-explorer';

describe('block explorer URLs', function () {
  it('builds transaction URLs for built-in and custom networks', function () {
    const tests = [
      {
        expected: 'https://etherscan.io/tx/0xabcd',
        networkId: '1',
        hash: '0xabcd',
      },
      {
        expected: 'https://basescan.org/tx/0xdef0',
        networkId: '8453',
        hash: '0xdef0',
        rpcPrefs: {},
      },
      {
        // shut-down testnets and unknown networks have no explorer
        expected: '',
        networkId: '3',
        hash: '0xdef0',
      },
      {
        expected: 'https://block.explorer/tx/0xabcd',
        networkId: '31',
        hash: '0xabcd',
        rpcPrefs: { blockExplorerUrl: 'https://block.explorer' },
      },
      {
        // a trailing `/` on a custom explorer is dropped
        expected: 'https://another.block.explorer/tx/0xdef0',
        networkId: '33',
        hash: '0xdef0',
        rpcPrefs: { blockExplorerUrl: 'https://another.block.explorer/' },
      },
    ];

    for (const { expected, networkId, hash, rpcPrefs } of tests) {
      assert.equal(getTxExplorerUrl(hash, networkId, rpcPrefs), expected);
    }
  });

  it('builds address URLs, preferring a custom explorer', function () {
    const address = `0x${'1'.repeat(40)}`;
    assert.equal(
      getAddressExplorerUrl(address, '1'),
      `https://etherscan.io/address/${address}`,
    );
    assert.equal(
      getAddressExplorerUrl(address, '1', {
        blockExplorerUrl: 'https://custom.explorer//',
      }),
      `https://custom.explorer/address/${address}`,
    );
    assert.equal(getAddressExplorerUrl(address, '3'), '');
  });
});
