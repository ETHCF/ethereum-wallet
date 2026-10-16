import assert from 'assert';
import { mount } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import * as i18nHook from '../../../../hooks/useI18nContext';
import TransactionSimulation from '../transaction-simulation.component';
import {
  SIMULATION_STALE_LOADING_MS,
  describeSimulation,
  isSimulationLoadingStale,
} from '../transaction-simulation.util';

const TOKEN = '0x3333333333333333333333333333333333333333';
const NFT = '0x4444444444444444444444444444444444444444';
const SPENDER = '0x2222222222222222222222222222222222222222';

// Echoes the key and its substitutions, so the tests see what is shown.
const t = (key, args = []) => [key, ...args].join('|');

describe('TransactionSimulation', function () {
  describe('describeSimulation', function () {
    it('shows native and tracked token changes with their decimals, exactly', function () {
      const { changes } = describeSimulation(
        {
          status: 'success',
          changes: [
            { standard: 'native', amount: '-1500000000000000001' },
            { standard: 'erc20', address: TOKEN, amount: '2500000' },
          ],
          approvals: [],
          // a tracked token's details win over what the contract claims
          tokens: { [TOKEN]: { symbol: 'FAKE', decimals: 18 } },
        },
        {
          t,
          nativeCurrency: 'ETH',
          trackedTokens: [
            {
              address: '0x3333333333333333333333333333333333333333',
              symbol: 'USDC',
              decimals: 6,
            },
          ],
        },
      );
      assert.deepEqual(
        changes.map(({ incoming, text }) => [incoming, text]),
        [
          [false, '-1.500000000000000001 ETH'],
          [true, '+2.5 USDC'],
        ],
      );
    });

    it("labels an untracked token with its contract's symbol and address", function () {
      const { changes } = describeSimulation(
        {
          changes: [{ standard: 'erc20', address: TOKEN, amount: '-1000' }],
          tokens: { [TOKEN]: { symbol: 'TKN', decimals: 3 } },
        },
        { t },
      );
      assert.equal(changes[0].text, '-1 TKN (0x3333…3333)');
    });

    it('shows raw units when the decimals are unknown', function () {
      const { changes } = describeSimulation(
        { changes: [{ standard: 'erc20', address: TOKEN, amount: '-1000' }] },
        { t },
      );
      assert.equal(changes[0].text, '-simulationRawUnits|1000|0x3333…3333');
    });

    it('shows NFTs by token id', function () {
      const { changes } = describeSimulation(
        {
          changes: [
            { standard: 'erc721', address: NFT, tokenId: '7', amount: '1' },
            { standard: 'erc1155', address: NFT, tokenId: '9', amount: '-3' },
          ],
          tokens: { [NFT]: { symbol: 'APE' } },
        },
        { t },
      );
      assert.deepEqual(
        changes.map(({ text }) => text),
        ['+APE (0x4444…4444) #7', '-3 × APE (0x4444…4444) #9'],
      );
    });

    it('describes approvals, with large allowances as unlimited', function () {
      const { approvals } = describeSimulation(
        {
          approvals: [
            {
              standard: 'erc20',
              address: TOKEN,
              spender: SPENDER,
              amount: (2n ** 256n - 1n).toString(),
            },
            {
              standard: 'erc20',
              address: TOKEN,
              spender: SPENDER,
              amount: '1500',
            },
            {
              standard: 'erc721',
              address: NFT,
              spender: SPENDER,
              tokenId: '1',
            },
            {
              standard: 'approvalForAll',
              address: NFT,
              spender: SPENDER,
              approved: true,
            },
            {
              standard: 'approvalForAll',
              address: NFT,
              spender: SPENDER,
              approved: false,
            },
          ],
          tokens: { [TOKEN]: { symbol: 'TKN', decimals: 3 } },
        },
        { t },
      );
      assert.deepEqual(
        approvals.map(({ text }) => text),
        [
          `simulationApproveSpend|${SPENDER}|unlimited TKN (0x3333…3333)`,
          `simulationApproveSpend|${SPENDER}|1.5 TKN (0x3333…3333)`,
          `simulationApproveNft|${SPENDER}|0x4444…4444 #1`,
          `simulationApproveAll|${SPENDER}|0x4444…4444`,
          `simulationRevokeAll|${SPENDER}|0x4444…4444`,
        ],
      );
    });
  });

  describe('isSimulationLoadingStale', function () {
    it('gives up on a preview loading too long', function () {
      const simulation = { status: 'loading', startedAt: 1000 };
      assert.equal(isSimulationLoadingStale(simulation, 1000), false);
      assert.equal(
        isSimulationLoadingStale(
          simulation,
          1001 + SIMULATION_STALE_LOADING_MS,
        ),
        true,
      );
    });
  });

  describe('component', function () {
    before(function () {
      sinon.stub(i18nHook, 'useI18nContext').returns(t);
    });

    after(function () {
      sinon.restore();
    });

    it('shows nothing without a simulation', function () {
      const wrapper = mount(<TransactionSimulation />);
      assert.equal(wrapper.html(), null);
    });

    it('notes a network without eth_simulateV1, without alarm', function () {
      const wrapper = mount(
        <TransactionSimulation
          simulation={{ status: 'unavailable', reason: 'unsupported' }}
        />,
      );
      assert.equal(wrapper.text(), 'simulationUnavailable');
      assert.ok(wrapper.find('.transaction-simulation--muted').exists());
      assert.equal(wrapper.find('[role="alert"]').exists(), false);
    });

    it('shows a loading preview', function () {
      const wrapper = mount(
        <TransactionSimulation
          simulation={{ status: 'loading', startedAt: Date.now() }}
        />,
      );
      assert.equal(wrapper.text(), 'simulationLoading');
    });

    it('warns that a reverting transaction is likely to fail', function () {
      const wrapper = mount(
        <TransactionSimulation
          simulation={{ status: 'reverted', revertReason: 'paused' }}
        />,
      );
      assert.ok(wrapper.find('[role="alert"]').exists());
      assert.ok(wrapper.text().includes('simulationLikelyToFail|paused'));
      assert.ok(wrapper.text().includes('simulationDisclaimer'));
    });

    it('lists the estimated changes, labelled as an estimate', function () {
      const wrapper = mount(
        <TransactionSimulation
          simulation={{
            status: 'success',
            changes: [{ standard: 'native', amount: '-1000000000000000000' }],
            approvals: [],
          }}
          nativeCurrency="ETH"
          stale
        />,
      );
      const text = wrapper.text();
      assert.ok(text.includes('simulationTitle'));
      assert.ok(text.includes('-1 ETH'));
      assert.ok(text.includes('simulationStale'));
      assert.ok(text.includes('simulationDisclaimer'));
    });

    it('says when nothing changes', function () {
      const wrapper = mount(
        <TransactionSimulation
          simulation={{ status: 'success', changes: [], approvals: [] }}
        />,
      );
      assert.ok(wrapper.text().includes('simulationNoChanges'));
    });
  });
});
