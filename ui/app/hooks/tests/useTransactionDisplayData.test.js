import { renderHook } from '@testing-library/react';
import assert from 'assert';
import * as reactRedux from 'react-redux';
import sinon from 'sinon';

import messages from '../../../../app/_locales/en/messages.json';
import transactions from '../../../../test/data/transaction-data.json';
import { getTokens } from '../../ducks/ecf-wallet/ecf-wallet';
import { getMessage } from '../../helpers/utils/i18n-helper';
import { getNativeCurrency } from '../../selectors';
import * as i18nhooks from '../useI18nContext';
import { useTransactionDisplayData } from '../useTransactionDisplayData';

const expectedResults = [
  {
    title: 'Send ETH',
    category: 'send',
    subtitle: 'To: 0xffe5bc4e8f1f969934d773fa67da095d2e491a97',
    subtitleContainsOrigin: false,
    date: 'May 12',
    primaryCurrency: '-1 ETH',
    senderAddress: '0x9eca64466f257793eaa52fcfff5066894b76a149',
    recipientAddress: '0xffe5bc4e8f1f969934d773fa67da095d2e491a97',
    isPending: false,
    status: 'confirmed',
  },
  {
    title: 'Send ETH',
    category: 'send',
    subtitle: 'To: 0x0ccc8aeeaf5ce790f3b448325981a143fdef8848',
    subtitleContainsOrigin: false,
    date: 'May 12',
    primaryCurrency: '-2 ETH',
    senderAddress: '0x9eca64466f257793eaa52fcfff5066894b76a149',
    recipientAddress: '0x0ccc8aeeaf5ce790f3b448325981a143fdef8848',
    isPending: false,
    status: 'confirmed',
  },
  {
    title: 'Send ETH',
    category: 'send',
    subtitle: 'To: 0xffe5bc4e8f1f969934d773fa67da095d2e491a97',
    subtitleContainsOrigin: false,
    date: 'May 12',
    primaryCurrency: '-2 ETH',
    senderAddress: '0x9eca64466f257793eaa52fcfff5066894b76a149',
    recipientAddress: '0xffe5bc4e8f1f969934d773fa67da095d2e491a97',
    isPending: false,
    status: 'confirmed',
  },
];

let useSelector, useI18nContext;

describe('useTransactionDisplayData', function () {
  let clock;

  before(function () {
    clock = sinon.useFakeTimers({
      now: new Date('2020-05-25').getTime(),
      toFake: ['Date'],
    });
    useSelector = sinon.stub(reactRedux, 'useSelector');
    useI18nContext = sinon.stub(i18nhooks, 'useI18nContext');
    useI18nContext.returns((key, variables) =>
      getMessage('en', messages, key, variables),
    );
    useSelector.callsFake((selector) => {
      if (selector === getTokens) {
        return [];
      } else if (selector === getNativeCurrency) {
        return 'ETH';
      }
      return null;
    });
  });
  transactions.forEach((transactionGroup, idx) => {
    describe(`when called with group containing primaryTransaction id ${transactionGroup.primaryTransaction.id}`, function () {
      const expected = expectedResults[idx];

      it(`should return a title of ${expected.title}`, function () {
        const { result } = renderHook(() =>
          useTransactionDisplayData(transactionGroup),
        );
        assert.equal(result.current.title, expected.title);
      });

      it(`should return a subtitle of ${expected.subtitle}`, function () {
        const { result } = renderHook(() =>
          useTransactionDisplayData(transactionGroup),
        );
        assert.equal(result.current.subtitle, expected.subtitle);
      });

      it(`should return a category of ${expected.category}`, function () {
        const { result } = renderHook(() =>
          useTransactionDisplayData(transactionGroup),
        );
        assert.equal(result.current.category, expected.category);
      });

      it(`should return a primaryCurrency of ${expected.primaryCurrency}`, function () {
        const { result } = renderHook(() =>
          useTransactionDisplayData(transactionGroup),
        );
        assert.equal(result.current.primaryCurrency, expected.primaryCurrency);
      });

      it(`should return a status of ${expected.status}`, function () {
        const { result } = renderHook(() =>
          useTransactionDisplayData(transactionGroup),
        );
        assert.equal(result.current.status, expected.status);
      });

      it(`should return a recipientAddress of ${expected.recipientAddress}`, function () {
        const { result } = renderHook(() =>
          useTransactionDisplayData(transactionGroup),
        );
        assert.equal(
          result.current.recipientAddress,
          expected.recipientAddress,
        );
      });

      it(`should return a senderAddress of ${expected.senderAddress}`, function () {
        const { result } = renderHook(() =>
          useTransactionDisplayData(transactionGroup),
        );
        assert.equal(result.current.senderAddress, expected.senderAddress);
      });
    });
  });

  it('should return an appropriate object', function () {
    const { result } = renderHook(() =>
      useTransactionDisplayData(transactions[0]),
    );
    assert.deepEqual(result.current, expectedResults[0]);
  });

  after(function () {
    clock.restore();
    useSelector.restore();
    useI18nContext.restore();
  });
});
