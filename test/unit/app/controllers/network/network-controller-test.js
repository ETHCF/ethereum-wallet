import assert from 'assert';
import nock from 'nock';

import NetworkController from '../../../../../app/scripts/controllers/network';

describe('NetworkController', function () {
  describe('controller', function () {
    let networkController;
    const noop = () => undefined;
    const networkControllerProviderConfig = {
      getAccounts: noop,
    };

    beforeEach(function () {
      nock('https://ethereum-sepolia-rpc.publicnode.com')
        .persist()
        .post('/')
        .reply(200);

      networkController = new NetworkController();
    });

    afterEach(function () {
      nock.cleanAll();
    });

    describe('#provider', function () {
      it('provider should be updatable without reassignment', function () {
        networkController.initializeProvider(networkControllerProviderConfig);
        const providerProxy =
          networkController.getProviderAndBlockTracker().provider;
        assert.equal(providerProxy.test, undefined);
        providerProxy.setTarget({ test: true });
        assert.equal(providerProxy.test, true);
      });
    });

    it('keeps network history IDs separate from the signing chain ID', async function () {
      networkController.providerStore.putState({ type: 'localhost' });
      networkController._provider = {
        sendAsync: (request, callback) =>
          callback(null, {
            id: request.id,
            jsonrpc: '2.0',
            result: request.method === 'net_version' ? '5777' : '0x539',
          }),
      };
      await new Promise((resolve) => {
        networkController.networkStore.subscribe((state) => {
          if (state !== 'loading') {
            resolve();
          }
        });
        networkController.lookupNetwork();
      });
      assert.equal(networkController.getNetworkState(), '5777');
      assert.equal(networkController.getChainId(), '0x539');
    });

    function lookup({ netVersion, chainId }) {
      networkController._provider = {
        sendAsync: (request, callback) =>
          callback(null, {
            id: request.id,
            jsonrpc: '2.0',
            result: request.method === 'net_version' ? netVersion : chainId,
          }),
      };
      const settled = new Promise((resolve) => setTimeout(resolve, 10));
      networkController.lookupNetwork();
      return settled;
    }

    it('refuses a custom RPC that reports a different chain ID than configured', async function () {
      networkController.providerStore.putState({
        type: 'rpc',
        rpcTarget: 'https://rpc.test',
        chainId: '137',
      });
      await lookup({ netVersion: '1', chainId: '0x1' });
      assert.equal(networkController.getNetworkState(), 'loading');
      assert.equal(networkController.getChainId(), undefined);

      await lookup({ netVersion: '137', chainId: '0x89' });
      assert.equal(networkController.getChainId(), '0x89');
      assert.notEqual(networkController.getNetworkState(), 'loading');
    });

    it('refuses a custom RPC with no configured chain ID', async function () {
      // Otherwise the RPC would choose the chain transactions are signed for.
      networkController.providerStore.putState({
        type: 'rpc',
        rpcTarget: 'https://rpc.test',
      });
      await lookup({ netVersion: '1', chainId: '0x1' });
      assert.equal(networkController.getNetworkState(), 'loading');
      assert.equal(networkController.getChainId(), undefined);

      assert.throws(
        () => networkController.setRpcTarget('https://rpc.test', undefined),
        /needs a valid chain ID/u,
      );
      assert.throws(
        () => networkController.setRpcTarget('https://rpc.test', '1abc'),
        /needs a valid chain ID/u,
      );
    });

    describe('#getNetworkState', function () {
      it('should return "loading" when new', function () {
        const networkState = networkController.getNetworkState();
        assert.equal(networkState, 'loading', 'network is loading');
      });
    });

    describe('#setProviderType', function () {
      it('should update provider.type', function () {
        networkController.initializeProvider(networkControllerProviderConfig);
        networkController.setProviderType('mainnet');
        const { type } = networkController.getProviderConfig();
        assert.equal(type, 'mainnet', 'provider type is updated');
      });

      it("uses the network's own currency and rejects shut-down testnets", async function () {
        networkController.initializeProvider(networkControllerProviderConfig);
        await networkController.setProviderType('polygon');
        assert.equal(networkController.getProviderConfig().ticker, 'POL');
        for (const type of ['ropsten', 'rinkeby', 'kovan', 'goerli']) {
          await assert.rejects(
            networkController.setProviderType(type),
            /Unknown rpc type/u,
          );
        }
      });

      it('should set the network to loading', function () {
        networkController.initializeProvider(networkControllerProviderConfig);
        networkController.setProviderType('mainnet');
        const loading = networkController.isNetworkLoading();
        assert.ok(loading, 'network is loading');
      });
    });
  });
});
