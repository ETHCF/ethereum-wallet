import { renderHook } from '@testing-library/react';
import assert from 'assert';
import * as reactRedux from 'react-redux';
import sinon from 'sinon';

import transactions from '../../../../test/data/transaction-data.json';
import { showSidebar } from '../../store/actions';
import { useRetryTransaction } from '../useRetryTransaction';

describe('useRetryTransaction', function () {
  describe('when transaction meets retry enabled criteria', function () {
    const dispatch = sinon.spy(() => Promise.resolve({}));
    const event = {
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    };

    const retryEnabledTransaction = {
      ...transactions[0],
      transactions: [
        {
          submittedTime: new Date() - 5001,
        },
      ],
      hasRetried: false,
    };

    it('retryTransaction function should show retry sidebar', async function () {
      sinon.stub(reactRedux, 'useDispatch').returns(dispatch);
      try {
        const { result } = renderHook(() =>
          useRetryTransaction(retryEnabledTransaction),
        );
        const retry = result.current;
        await retry(event);
        const calls = dispatch.getCalls();
        assert.equal(calls.length, 4);
        assert.equal(
          dispatch.calledWith(
            showSidebar({
              transitionName: 'sidebar-left',
              type: 'customize-gas',
              props: {
                transaction: retryEnabledTransaction.initialTransaction,
              },
            }),
          ),
          true,
        );
      } finally {
        sinon.restore();
      }
    });
  });
});
