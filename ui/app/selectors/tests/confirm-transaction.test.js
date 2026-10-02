import assert from 'assert'
import {
  unconfirmedTransactionsCountSelector,
  tokenAmountAndToAddressSelector,
  approveTokenAmountAndToAddressSelector,
  sendTokenTokenAmountAndToAddressSelector,
  conversionRateSelector,
} from '../confirm-transaction'

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
        unapprovedMsgCount: 1,
        unapprovedPersonalMsgCount: 1,
        unapprovedTypedMessagesCount: 1,
        network: 'test',
      },
    }

    it('returns number of txs in unapprovedTxs state with the same network plus unapproved signing method counts', function () {
      assert.equal(unconfirmedTransactionsCountSelector(state), 4)
    })

  })

  describe('tokenAmountAndToAddressSelector', function () {

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
    }

    it('returns calculated token amount based on token value and token decimals and recipient address', function () {
      assert.deepEqual(tokenAmountAndToAddressSelector(state),
        { toAddress: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc', tokenAmount: 0.01 })
    })

  })

  describe('approveTokenAmountAndToAddressSelector', function () {

    const state = {
      confirmTransaction: {
        tokenData: {
          name: 'approve',
          params: [
            {
              name: '_spender',
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
    }

    it('returns token amount and recipient for approve token allocation spending', function () {
      assert.deepEqual(approveTokenAmountAndToAddressSelector(state),
        { toAddress: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc', tokenAmount: 0.01 })
    })

  })

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
    }

    it('returns token address and calculated token amount', function () {
      assert.deepEqual(sendTokenTokenAmountAndToAddressSelector(state),
        { toAddress: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc', tokenAmount: 0.01 })
    })

  })

  describe('conversionRateSelector', function () {
    it('returns conversionRate from state', function () {
      const state = {
        ecfWallet: { conversionRate: 556.12 },
      }
      assert.equal(conversionRateSelector(state), 556.12)
    })
  })
})
