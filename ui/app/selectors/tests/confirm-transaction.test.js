import assert from 'assert';

import {
  unconfirmedTransactionsCountSelector,
  unconfirmedTransactionsListSelector,
  sendTokenTokenAmountAndToAddressSelector,
} from '../confirm-transaction';

describe('Confirm Transaction Selector', function () {
  describe('unconfirmedTransactionsCountSelector', function () {
    const state = {
      ecfWallet: {
        unapprovedTxs: {
          1: {
            ecfWalletNetworkId: 'test',
          },
          2: {
            metmaskNetworkId: 'other network',
          },
        },
        unapprovedDecryptMsgCount: 1,
        unapprovedPersonalMsgCount: 1,
        unapprovedTypedMessagesCount: 1,
        network: 'test',
      },
    };

    it('returns number of txs in unapprovedTxs state with the same network plus unapproved signing method counts', function () {
      assert.equal(unconfirmedTransactionsCountSelector(state), 4);
    });
  });

  describe('unconfirmedTransactionsListSelector', function () {
    it('lists current-network txs and pending messages, oldest first', function () {
      const state = {
        ecfWallet: {
          unapprovedTxs: {
            1: { id: 1, ecfWalletNetworkId: 'test', time: 3 },
            2: { id: 2, ecfWalletNetworkId: 'other network', time: 1 },
          },
          unapprovedPersonalMsgs: { 3: { id: 3, time: 2 } },
          unapprovedTypedMessages: { 4: { id: 4, time: 4 } },
          network: 'test',
        },
      };

      assert.deepEqual(
        unconfirmedTransactionsListSelector(state).map(({ id }) => id),
        [3, 1, 4],
      );
    });
  });

  describe('sendTokenTokenAmountAndToAddressSelector', function () {
    const state = {
      confirmTransaction: {
        tokenData: {
          name: 'transfer',
          params: [
            {
              name: '_to',
              value: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
              type: 'address',
            },
            {
              name: '_value',
              value: '1',
              type: 'uint256',
            },
          ],
        },
        tokenProps: {
          tokenDecimals: '2',
          tokenSymbol: 'META',
        },
      },
    };

    it('returns token address and calculated token amount', function () {
      assert.deepEqual(sendTokenTokenAmountAndToAddressSelector(state), {
        toAddress: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc',
        tokenAmount: 0.01,
      });
    });
  });
});
