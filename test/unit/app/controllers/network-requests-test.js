import { strict as assert } from 'assert';
import sinon from 'sinon';

import NetworkRequestController, {
  UNRECOGNIZED_CHAIN_ERROR_CODE,
} from '../../../../app/scripts/controllers/network-requests';

const ORIGIN = 'https://dapp.test';

function addParams(overrides = {}) {
  return [
    {
      chainId: '0x64',
      chainName: 'Gnosis',
      rpcUrls: ['https://rpc.gnosis.test'],
      nativeCurrency: { name: 'xDAI', symbol: 'XDAI', decimals: 18 },
      blockExplorerUrls: ['https://gnosisscan.test'],
      ...overrides,
    },
  ];
}

describe('NetworkRequestController', function () {
  let controller;
  let deps;
  let customNetworks;
  let currentChainId;

  beforeEach(function () {
    customNetworks = [];
    currentChainId = '0x1';
    deps = {
      getCurrentChainId: () => currentChainId,
      getCustomNetworks: () => customNetworks,
      addCustomNetwork: sinon.stub().resolves(),
      setCustomNetwork: sinon.stub().resolves(),
      setBuiltInNetwork: sinon.stub().resolves(),
      showApprovalRequest: sinon.spy(),
      getRpcChainId: sinon.stub().callsFake(async () => '0x64'),
    };
    controller = new NetworkRequestController(deps);
  });

  const pending = () =>
    Object.values(controller.memStore.getState().pendingNetworkRequests);

  async function waitForPending() {
    for (let i = 0; i < 20 && pending().length === 0; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    return pending();
  }

  describe('wallet_addEthereumChain', function () {
    it('asks for approval, then checks the RPC and adds and selects the network', async function () {
      const result = controller.addChain(ORIGIN, addParams());
      const [request] = await waitForPending();
      assert.equal(deps.getRpcChainId.called, false);
      assert.equal(request.origin, ORIGIN);
      assert.equal(request.type, 'add');
      assert.deepEqual(request.network, {
        chainId: '0x64',
        chainName: 'Gnosis',
        rpcUrl: 'https://rpc.gnosis.test/',
        ticker: 'XDAI',
        blockExplorerUrl: 'https://gnosisscan.test/',
      });
      assert.deepEqual(request.warnings, [['networkRequestRpcNotice', []]]);
      assert.equal(deps.showApprovalRequest.callCount, 1);
      assert.equal(controller.pendingCount, 1);
      assert.equal(deps.addCustomNetwork.called, false);

      await controller.approve(request.id);
      assert.equal(await result, null);
      assert.deepEqual(deps.getRpcChainId.firstCall.args, [
        'https://rpc.gnosis.test/',
      ]);
      assert.deepEqual(
        deps.addCustomNetwork.firstCall.args[0],
        request.network,
      );
      assert.equal(controller.pendingCount, 0);
    });

    it('returns a user rejection without changing anything', async function () {
      const result = controller.addChain(ORIGIN, addParams());
      const [request] = await waitForPending();
      controller.reject(request.id);
      await assert.rejects(result, { code: 4001 });
      assert.equal(deps.addCustomNetwork.called, false);
    });

    it('contacts the RPC only after approval, and then refuses one that serves a different chain or cannot be reached', async function () {
      // A public name can resolve to a host on the user's network, so no
      // endpoint is contacted, and nothing is reported, before approval.
      for (const [answer, message] of [
        [async () => '0x1', /different chain ID \(0x1\)/u],
        [
          async () => {
            throw new Error('offline');
          },
          /Could not fetch the chain ID/u,
        ],
      ]) {
        deps.getRpcChainId.resetHistory();
        deps.getRpcChainId.callsFake(answer);
        const result = controller.addChain(
          ORIGIN,
          addParams({ rpcUrls: ['https://intranet.example.com'] }),
        );
        const [shown] = await waitForPending();
        assert.equal(deps.getRpcChainId.called, false);

        await assert.rejects(controller.approve(shown.id), message);
        await assert.rejects(result, message);
      }
      assert.equal(deps.addCustomNetwork.called, false);
    });

    it('checks the RPC when the user asks, without answering the site', async function () {
      let settled = false;
      const result = controller.addChain(ORIGIN, addParams());
      result
        .catch(() => undefined)
        .finally(() => {
          settled = true;
        });
      const [request] = await waitForPending();

      assert.equal(await controller.checkRpc(request.id), null);
      deps.getRpcChainId.callsFake(async () => '0x1');
      assert.match(
        await controller.checkRpc(request.id),
        /different chain ID \(0x1\)/u,
      );
      deps.getRpcChainId.callsFake(async () => {
        throw new Error('offline');
      });
      assert.match(
        await controller.checkRpc(request.id),
        /Could not fetch the chain ID/u,
      );

      // The request stays pending for the user to decide.
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(settled, false);
      assert.equal(controller.pendingCount, 1);
      await assert.rejects(controller.checkRpc('unknown'), /not found/u);
      controller.reject(request.id);
      await assert.rejects(result, { code: 4001 });
    });

    it('only checks the RPC of a request to add a network', async function () {
      customNetworks = [{ rpcUrl: 'https://rpc.gnosis.test', chainId: '0x64' }];
      controller
        .switchChain(ORIGIN, [{ chainId: '0x64' }])
        .catch(() => undefined);
      const [request] = await waitForPending();
      await assert.rejects(controller.checkRpc(request.id), /not found/u);
      assert.equal(deps.getRpcChainId.called, false);
    });

    const invalidCases = [
      ['a non-array', {}, /single object parameter/u],
      [
        'a chain ID with leading zeros',
        addParams({ chainId: '0x064' }),
        /Invalid chainId/u,
      ],
      ['a decimal chain ID', addParams({ chainId: '100' }), /Invalid chainId/u],
      [
        'an oversized chain ID',
        addParams({ chainId: '0x10000000000000' }),
        /Invalid chainId/u,
      ],
      ['unexpected keys', addParams({ extra: true }), /Unsupported fields/u],
      [
        'a plain HTTP RPC on another host',
        addParams({ rpcUrls: ['http://rpc.test'] }),
        /https URL/u,
      ],
      [
        'an RPC URL with credentials',
        addParams({ rpcUrls: ['https://user:pass@rpc.test'] }),
        /https URL/u,
      ],

      [
        'a javascript: RPC URL',
        // eslint-disable-next-line no-script-url -- asserts that javascript: URLs are rejected
        addParams({ rpcUrls: ['javascript:alert(1)'] }),
        /https URL/u,
      ],
      [
        'an HTTP explorer',
        addParams({ blockExplorerUrls: ['http://scan.test'] }),
        /blockExplorerUrls/u,
      ],
      [
        'non-18 decimals',
        addParams({ nativeCurrency: { symbol: 'X', decimals: 6 } }),
        /decimals/u,
      ],
      [
        'a long symbol',
        addParams({ nativeCurrency: { symbol: 'TOOLONGX', decimals: 18 } }),
        /symbol/u,
      ],
      [
        'a name with direction overrides',
        addParams({ chainName: 'Gnosis‮' }),
        /chainName/u,
      ],
      ['an empty name', addParams({ chainName: '  ' }), /chainName/u],
    ];
    invalidCases.forEach(([description, params, message]) => {
      it(`rejects ${description}`, async function () {
        await assert.rejects(controller.addChain(ORIGIN, params), message);
        assert.equal(deps.showApprovalRequest.called, false);
      });
    });

    it('warns about unknown chains, mismatched currencies, local HTTP and a second RPC for a chain', async function () {
      customNetworks = [
        {
          rpcUrl: 'https://other.rpc.test',
          chainId: '100',
          ticker: 'XDAI',
          nickname: 'Gnosis',
        },
      ];
      deps.getRpcChainId.callsFake(async () => '0x64');
      controller
        .addChain(
          ORIGIN,
          addParams({
            rpcUrls: ['http://localhost:8545'],
            nativeCurrency: { symbol: 'ETH', decimals: 18 },
          }),
        )
        .catch(() => undefined);
      const [request] = await waitForPending();
      assert.deepEqual(
        request.warnings.map(([key]) => key),
        [
          'networkRequestRpcNotice',
          'networkRequestSymbolMismatch',
          'networkRequestInsecureRpc',
          'networkRequestDifferentRpc',
        ],
      );
      assert.deepEqual(request.warnings[1][1], ['Gnosis', 'XDAI', 'ETH']);
      controller.reject(request.id);

      deps.getRpcChainId.callsFake(async () => '0x99999');
      controller
        .addChain('https://other.test', addParams({ chainId: '0x99999' }))
        .catch(() => undefined);
      const [unknown] = await waitForPending();
      assert.deepEqual(
        unknown.warnings.map(([key]) => key),
        ['networkRequestRpcNotice', 'networkRequestUnknownChain'],
      );
    });

    it("switches to a built-in network instead of adding the site's RPC for it", async function () {
      const result = controller.addChain(
        ORIGIN,
        addParams({
          chainId: '0x89',
          chainName: 'Fake Polygon',
          rpcUrls: ['https://evil.test'],
        }),
      );
      const [request] = await waitForPending();
      assert.equal(request.type, 'switch');
      assert.equal(request.network.chainName, 'Polygon');
      assert.equal(request.network.rpcUrl, undefined);
      assert.equal(deps.getRpcChainId.called, false);
      await controller.approve(request.id);
      assert.equal(await result, null);
      assert.deepEqual(deps.setBuiltInNetwork.firstCall.args, ['polygon']);
      assert.equal(deps.addCustomNetwork.called, false);
    });

    it('asks to switch when the same network is already saved', async function () {
      customNetworks = [
        {
          rpcUrl: 'https://rpc.gnosis.test/',
          chainId: '0x64',
          ticker: 'XDAI',
          nickname: 'Gnosis',
        },
      ];
      controller.addChain(ORIGIN, addParams()).catch(() => undefined);
      const [request] = await waitForPending();
      assert.equal(request.type, 'switch');
      assert.equal(deps.getRpcChainId.called, false);
    });
  });

  describe('wallet_switchEthereumChain', function () {
    it('answers immediately when the chain is already selected', async function () {
      assert.equal(
        await controller.switchChain(ORIGIN, [{ chainId: '0x1' }]),
        null,
      );
      assert.equal(deps.showApprovalRequest.called, false);
    });

    it('returns 4902 for a chain the wallet does not have', async function () {
      await assert.rejects(
        controller.switchChain(ORIGIN, [{ chainId: '0x64' }]),
        { code: UNRECOGNIZED_CHAIN_ERROR_CODE },
      );
      for (const chainId of ['0x3', '0x4', '0x5', '0x2a']) {
        await assert.rejects(controller.switchChain(ORIGIN, [{ chainId }]), {
          code: UNRECOGNIZED_CHAIN_ERROR_CODE,
        });
      }
    });

    it('switches to a saved network, matching decimal or hex chain IDs, after approval', async function () {
      customNetworks = [
        {
          rpcUrl: 'https://rpc.gnosis.test',
          chainId: '100',
          ticker: 'XDAI',
          nickname: 'Gnosis',
        },
      ];
      const result = controller.switchChain(ORIGIN, [{ chainId: '0x64' }]);
      const [request] = await waitForPending();
      assert.equal(request.network.chainName, 'Gnosis');
      await controller.approve(request.id);
      assert.equal(await result, null);
      assert.equal(
        deps.setCustomNetwork.firstCall.args[0].rpcUrl,
        'https://rpc.gnosis.test',
      );
    });

    it('fails if the saved network was removed while the request was pending', async function () {
      customNetworks = [{ rpcUrl: 'https://rpc.gnosis.test', chainId: '0x64' }];
      const result = controller.switchChain(ORIGIN, [{ chainId: '0x64' }]);
      const [request] = await waitForPending();
      customNetworks = [];
      await assert.rejects(controller.approve(request.id), {
        code: UNRECOGNIZED_CHAIN_ERROR_CODE,
      });
      await assert.rejects(result, { code: UNRECOGNIZED_CHAIN_ERROR_CODE });
      assert.equal(deps.setCustomNetwork.called, false);
    });

    it('allows one pending request per site', async function () {
      controller
        .switchChain(ORIGIN, [{ chainId: '0x2105' }])
        .catch(() => undefined);
      await waitForPending();
      await assert.rejects(
        controller.switchChain(ORIGIN, [{ chainId: '0x89' }]),
        /already pending/u,
      );
      await assert.rejects(
        controller.addChain(ORIGIN, addParams()),
        /already pending/u,
      );
      controller
        .switchChain('https://other.test', [{ chainId: '0x89' }])
        .catch(() => undefined);
      assert.equal(controller.pendingCount, 2);
    });

    it('allows one request per site even when several arrive at once', async function () {
      const first = controller.addChain(ORIGIN, addParams());
      await assert.rejects(
        controller.addChain(ORIGIN, addParams()),
        /already pending/u,
      );
      await assert.rejects(
        controller.switchChain(ORIGIN, [{ chainId: '0x89' }]),
        /already pending/u,
      );
      await waitForPending();
      assert.equal(controller.pendingCount, 1);
      assert.equal(deps.getRpcChainId.callCount, 0);
      controller.reject(pending()[0].id);
      await assert.rejects(first, { code: 4001 });
    });

    it('contacts a local RPC only after the user approves', async function () {
      deps.getRpcChainId.callsFake(async () => '0x1');
      const request = controller.addChain(
        ORIGIN,
        addParams({ rpcUrls: ['http://localhost:8545'] }),
      );
      const [shown] = await waitForPending();
      assert.equal(deps.getRpcChainId.callCount, 0);

      // The endpoint serves another chain, which only now comes out.
      await assert.rejects(controller.approve(shown.id), /different chain ID/u);
      await assert.rejects(request, /different chain ID/u);
      assert.equal(deps.addCustomNetwork.called, false);
    });

    it('rejects malformed params', async function () {
      for (const params of [
        [],
        [{}],
        [{ chainId: '0x1', extra: 1 }],
        [{ chainId: 1 }],
        ['0x1'],
      ]) {
        await assert.rejects(controller.switchChain(ORIGIN, params), {
          code: -32602,
        });
      }
    });
  });

  it('handles both methods through its RPC middleware and passes others on', async function () {
    const middleware = controller.createMiddleware({ origin: ORIGIN });
    const run = (req) =>
      new Promise((resolve) => {
        const res = {};
        middleware(
          req,
          res,
          () => resolve({ next: true }),
          (error) => resolve({ error, res }),
        );
      });
    assert.deepEqual(await run({ method: 'eth_chainId', params: [] }), {
      next: true,
    });
    const { res, error } = await run({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x1' }],
    });
    assert.ok(!error);
    assert.equal(res.result, null);
  });
});
