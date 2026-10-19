import assert from 'assert';
import configureMockStore from 'redux-mock-store';
import { thunk } from 'redux-thunk';
import sinon from 'sinon';

import * as tokenUtil from '../../../ui/app/helpers/utils/token-util';
import * as actionConstants from '../../../ui/app/store/actionConstants';
import * as actions from '../../../ui/app/store/actions';

const middlewares = [thunk];
const mockStore = configureMockStore(middlewares);

describe('tx confirmation screen', function () {
  const txId = 1457634084250832;
  const initialState = {
    appState: {},
    ecfWallet: {
      unapprovedTxs: {
        [txId]: {
          id: txId,
          status: 'unconfirmed',
          time: 1457634084250,
        },
      },
    },
  };

  const store = mockStore(initialState);

  describe('cancelTx', function () {
    it('creates COMPLETED_TX with the cancelled transaction ID', async function () {
      actions._setBackgroundConnection({
        approveTransaction(_, cb) {
          cb(new Error('An error!'));
        },
        cancelTransaction(_, cb) {
          cb();
        },
        getState(cb) {
          cb(null, {});
        },
      });

      await store.dispatch(actions.cancelTx({ id: txId }));
      const storeActions = store.getActions();
      const completedTxAction = storeActions.find(
        ({ type }) => type === actionConstants.COMPLETED_TX,
      );
      const { id } = completedTxAction.value;
      assert.equal(id, txId);
    });
  });

  describe('confirmation token metadata', function () {
    it('never persists fetched metadata after the wallet switches networks', async function () {
      let finish;
      const lookup = sinon.stub(tokenUtil, 'fetchSymbolAndDecimals').returns(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const addToken = sinon.spy(
        (_address, _symbol, _decimals, _image, callback) => callback(null, []),
      );
      actions._setBackgroundConnection({ addToken });
      const state = {
        ecfWallet: { tokens: [], provider: { type: 'mainnet' } },
      };
      const store = mockStore(() => state);
      try {
        const pending = store.dispatch(
          actions.getTokenParams('0x2222222222222222222222222222222222222222'),
        );
        state.ecfWallet.provider = { type: 'sepolia' };
        finish({ symbol: 'DEMO', decimals: '6' });
        assert.deepEqual(await pending, { symbol: 'DEMO', decimals: '6' });
        assert.equal(addToken.called, false);
        assert.deepEqual(store.getActions(), []);
      } finally {
        lookup.restore();
      }
    });
  });
});
