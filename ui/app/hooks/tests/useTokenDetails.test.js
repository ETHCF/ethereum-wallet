import { act, cleanup, renderHook } from '@testing-library/react';
import assert from 'assert';
import * as reactRedux from 'react-redux';
import sinon from 'sinon';

import * as tokenUtil from '../../helpers/utils/token-util';
import { useTokenDetails } from '../useTokenDetails';

describe('useTokenDetails network context', function () {
  const address = '0x2222222222222222222222222222222222222222';
  let state, fetchDetails, sandbox;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    state = {
      ecfWallet: {
        provider: {
          type: 'rpc',
          chainId: '0x1',
          rpcTarget: 'https://main.test',
        },
        tokens: [],
      },
    };
    sandbox
      .stub(reactRedux, 'useSelector')
      .callsFake((selector) => selector(state));
    fetchDetails = sandbox.stub(tokenUtil, 'fetchTokenDetails');
  });

  afterEach(function () {
    cleanup();
    sandbox.restore();
  });

  it('drops cached decimals immediately when the same address is viewed on another chain', async function () {
    fetchDetails.onFirstCall().resolves({ symbol: 'DEMO', decimals: '18' });
    let finish;
    fetchDetails.onSecondCall().returns(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result, rerender } = renderHook(() => useTokenDetails(address));
    await act(async () => undefined);
    assert.equal(result.current.decimals, 18);
    state.ecfWallet.provider = {
      type: 'rpc',
      chainId: '0x2',
      rpcTarget: 'https://other.test',
    };
    rerender();
    assert.equal(result.current.known, false);
    assert.equal(result.current.loading, true);
    await act(async () => finish({ symbol: 'DEMO', decimals: '6' }));
    assert.equal(result.current.decimals, 6);
    assert.equal(result.current.known, true);
  });

  it('ignores an old chain response that arrives after the new chain response', async function () {
    let finishOld;
    fetchDetails.onFirstCall().returns(
      new Promise((resolve) => {
        finishOld = resolve;
      }),
    );
    fetchDetails.onSecondCall().resolves({ symbol: 'DEMO', decimals: '6' });
    const { result, rerender } = renderHook(() => useTokenDetails(address));
    state.ecfWallet.provider = { type: 'sepolia' };
    rerender();
    await act(async () => undefined);
    assert.equal(result.current.decimals, 6);
    await act(async () => finishOld({ symbol: 'DEMO', decimals: '18' }));
    assert.equal(result.current.decimals, 6);
  });

  it('refetches when the RPC changes without changing the chain ID', async function () {
    fetchDetails.resolves({ symbol: 'DEMO', decimals: '6' });
    const { rerender } = renderHook(() => useTokenDetails(address));
    await act(async () => undefined);
    state.ecfWallet.provider = {
      ...state.ecfWallet.provider,
      rpcTarget: 'https://replacement.test',
    };
    rerender();
    await act(async () => undefined);
    assert.equal(fetchDetails.callCount, 2);
  });
});
