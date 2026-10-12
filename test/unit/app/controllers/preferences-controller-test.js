import { bytesToHex } from '@ethereumjs/util';
import { encode } from '@metamask/abi-utils';
import { ObservableStore } from '@metamask/obs-store';
import assert from 'assert';
import sinon from 'sinon';

import { addInternalMethodPrefix } from '../../../../app/scripts/controllers/permissions';
import PreferencesController from '../../../../app/scripts/controllers/preferences';

describe('preferences controller', function () {
  let preferencesController;
  let network;

  beforeEach(function () {
    network = { providerStore: new ObservableStore({ type: 'mainnet' }) };
    preferencesController = new PreferencesController({ network });
  });

  it('keeps NFT detection and NFT images off until the user turns them on', function () {
    const { useNftDetection, displayNftMedia } =
      preferencesController.store.getState();
    assert.equal(useNftDetection, false);
    assert.equal(displayNftMedia, false);
    preferencesController.setUseNftDetection(true);
    preferencesController.setDisplayNftMedia(true);
    assert.equal(preferencesController.store.getState().useNftDetection, true);
    assert.equal(preferencesController.store.getState().displayNftMedia, true);
  });

  describe('setAddresses', function () {
    it('should keep a map of addresses to names and addresses in the store', function () {
      preferencesController.setAddresses(['0xda22be', '0x7e57e2']);

      const { identities } = preferencesController.store.getState();
      assert.deepEqual(identities, {
        '0xda22be': {
          name: 'Account 1',
          address: '0xda22be',
        },
        '0x7e57e2': {
          name: 'Account 2',
          address: '0x7e57e2',
        },
      });
    });

    it('should create account tokens for each account in the store', function () {
      preferencesController.setAddresses(['0xda22be', '0x7e57e2']);

      const { accountTokens } = preferencesController.store.getState();

      assert.deepEqual(accountTokens, {
        '0xda22be': {},
        '0x7e57e2': {},
      });
    });

    it('should replace its list of addresses', function () {
      preferencesController.setAddresses(['0xda22be', '0x7e57e2']);
      preferencesController.setAddresses(['0xda22be77', '0x7e57e277']);

      const { identities } = preferencesController.store.getState();
      assert.deepEqual(identities, {
        '0xda22be77': {
          name: 'Account 1',
          address: '0xda22be77',
        },
        '0x7e57e277': {
          name: 'Account 2',
          address: '0x7e57e277',
        },
      });
    });
  });

  describe('removeAddress', function () {
    it('should remove an address from state', function () {
      preferencesController.setAddresses(['0xda22be', '0x7e57e2']);

      preferencesController.removeAddress('0xda22be');

      assert.equal(
        preferencesController.store.getState().identities['0xda22be'],
        undefined,
      );
    });

    it('should remove an address from state and respective tokens', function () {
      preferencesController.setAddresses(['0xda22be', '0x7e57e2']);

      preferencesController.removeAddress('0xda22be');

      assert.equal(
        preferencesController.store.getState().accountTokens['0xda22be'],
        undefined,
      );
    });

    it('should switch accounts if the selected address is removed', function () {
      preferencesController.setAddresses(['0xda22be', '0x7e57e2']);

      preferencesController.setSelectedAddress('0x7e57e2');
      preferencesController.removeAddress('0x7e57e2');

      assert.equal(preferencesController.getSelectedAddress(), '0xda22be');
    });
  });

  describe('setAccountLabel', function () {
    it('should update a label for the given account', function () {
      preferencesController.setAddresses(['0xda22be', '0x7e57e2']);

      assert.deepEqual(
        preferencesController.store.getState().identities['0xda22be'],
        {
          name: 'Account 1',
          address: '0xda22be',
        },
      );

      preferencesController.setAccountLabel('0xda22be', 'Dazzle');
      assert.deepEqual(
        preferencesController.store.getState().identities['0xda22be'],
        {
          name: 'Dazzle',
          address: '0xda22be',
        },
      );
    });
  });

  describe('getTokens', function () {
    it('should return an empty list initially', async function () {
      preferencesController.setAddresses(['0x7e57e2']);
      await preferencesController.setSelectedAddress('0x7e57e2');

      const tokens = preferencesController.getTokens();
      assert.equal(tokens.length, 0, 'empty list of tokens');
    });
  });

  describe('addToken', function () {
    it('should add that token to its state', async function () {
      const address = '0xabcdef1234567';
      const symbol = 'ABBR';
      const decimals = 5;

      preferencesController.setAddresses(['0x7e57e2']);
      await preferencesController.setSelectedAddress('0x7e57e2');
      await preferencesController.addToken(address, symbol, decimals);

      const tokens = preferencesController.getTokens();
      assert.equal(tokens.length, 1, 'one token added');

      const added = tokens[0];
      assert.equal(added.address, address, 'set address correctly');
      assert.equal(added.symbol, symbol, 'set symbol correctly');
      assert.equal(added.decimals, decimals, 'set decimals correctly');
    });

    it('should allow updating a token value', async function () {
      const address = '0xabcdef1234567';
      const symbol = 'ABBR';
      const decimals = 5;

      preferencesController.setAddresses(['0x7e57e2']);
      await preferencesController.setSelectedAddress('0x7e57e2');
      await preferencesController.addToken(address, symbol, decimals);

      const newDecimals = 6;
      await preferencesController.addToken(address, symbol, newDecimals);

      const tokens = preferencesController.getTokens();
      assert.equal(tokens.length, 1, 'one token added');

      const added = tokens[0];
      assert.equal(added.address, address, 'set address correctly');
      assert.equal(added.symbol, symbol, 'set symbol correctly');
      assert.equal(added.decimals, newDecimals, 'updated decimals correctly');
    });

    it('should allow adding tokens to two separate addresses', async function () {
      const address = '0xabcdef1234567';
      const symbol = 'ABBR';
      const decimals = 5;

      preferencesController.setAddresses(['0x7e57e2', '0xda22be']);

      await preferencesController.setSelectedAddress('0x7e57e2');
      await preferencesController.addToken(address, symbol, decimals);
      assert.equal(
        preferencesController.getTokens().length,
        1,
        'one token added for 1st address',
      );

      await preferencesController.setSelectedAddress('0xda22be');
      await preferencesController.addToken(address, symbol, decimals);
      assert.equal(
        preferencesController.getTokens().length,
        1,
        'one token added for 2nd address',
      );
    });
  });

  describe('removeToken', function () {
    it('should remove the only token from its state', async function () {
      preferencesController.setAddresses(['0x7e57e2']);
      await preferencesController.setSelectedAddress('0x7e57e2');
      await preferencesController.addToken('0xa', 'A', 5);
      await preferencesController.removeToken('0xa');

      const tokens = preferencesController.getTokens();
      assert.equal(tokens.length, 0, 'one token removed');
    });

    it('should remove a token from its state', async function () {
      preferencesController.setAddresses(['0x7e57e2']);
      await preferencesController.setSelectedAddress('0x7e57e2');
      await preferencesController.addToken('0xa', 'A', 4);
      await preferencesController.addToken('0xb', 'B', 5);
      await preferencesController.removeToken('0xa');

      const tokens = preferencesController.getTokens();
      assert.equal(tokens.length, 1, 'one token removed');

      const [token1] = tokens;
      assert.deepEqual(token1, { address: '0xb', symbol: 'B', decimals: 5 });
    });

    it('should remove a token from its state on corresponding address', async function () {
      preferencesController.setAddresses(['0x7e57e2', '0x7e57e3']);
      await preferencesController.setSelectedAddress('0x7e57e2');
      await preferencesController.addToken('0xa', 'A', 4);
      await preferencesController.addToken('0xb', 'B', 5);
      await preferencesController.setSelectedAddress('0x7e57e3');
      await preferencesController.addToken('0xa', 'A', 4);
      await preferencesController.addToken('0xb', 'B', 5);
      const initialTokensSecond = preferencesController.getTokens();
      await preferencesController.setSelectedAddress('0x7e57e2');
      await preferencesController.removeToken('0xa');

      const tokensFirst = preferencesController.getTokens();
      assert.equal(tokensFirst.length, 1, 'one token removed in account');

      const [token1] = tokensFirst;
      assert.deepEqual(token1, { address: '0xb', symbol: 'B', decimals: 5 });

      await preferencesController.setSelectedAddress('0x7e57e3');
      const tokensSecond = preferencesController.getTokens();
      assert.deepEqual(
        tokensSecond,
        initialTokensSecond,
        'token deleted for account',
      );
    });

    it('should remove a token from its state on corresponding network', async function () {
      network.providerStore.updateState({ type: 'mainnet' });
      await preferencesController.addToken('0xa', 'A', 4);
      await preferencesController.addToken('0xb', 'B', 5);
      network.providerStore.updateState({ type: 'rinkeby' });
      await preferencesController.addToken('0xa', 'A', 4);
      await preferencesController.addToken('0xb', 'B', 5);
      const initialTokensSecond = preferencesController.getTokens();
      network.providerStore.updateState({ type: 'mainnet' });
      await preferencesController.removeToken('0xa');

      const tokensFirst = preferencesController.getTokens();
      assert.equal(tokensFirst.length, 1, 'one token removed in network');

      const [token1] = tokensFirst;
      assert.deepEqual(token1, { address: '0xb', symbol: 'B', decimals: 5 });

      network.providerStore.updateState({ type: 'rinkeby' });
      const tokensSecond = preferencesController.getTokens();
      assert.deepEqual(
        tokensSecond,
        initialTokensSecond,
        'token deleted for network',
      );
    });
  });

  describe('on setSelectedAddress', function () {
    it('should update tokens from its state on corresponding address', async function () {
      preferencesController.setAddresses(['0x7e57e2', '0x7e57e3']);
      await preferencesController.setSelectedAddress('0x7e57e2');
      await preferencesController.addToken('0xa', 'A', 4);
      await preferencesController.addToken('0xb', 'B', 5);
      await preferencesController.setSelectedAddress('0x7e57e3');
      await preferencesController.addToken('0xa', 'C', 4);
      await preferencesController.addToken('0xb', 'D', 5);

      await preferencesController.setSelectedAddress('0x7e57e2');
      const initialTokensFirst = preferencesController.getTokens();
      await preferencesController.setSelectedAddress('0x7e57e3');
      const initialTokensSecond = preferencesController.getTokens();

      assert.notDeepEqual(
        initialTokensFirst,
        initialTokensSecond,
        'tokens not equal for different accounts and tokens',
      );

      await preferencesController.setSelectedAddress('0x7e57e2');
      const tokensFirst = preferencesController.getTokens();
      await preferencesController.setSelectedAddress('0x7e57e3');
      const tokensSecond = preferencesController.getTokens();

      assert.deepEqual(
        tokensFirst,
        initialTokensFirst,
        'tokens equal for same account',
      );
      assert.deepEqual(
        tokensSecond,
        initialTokensSecond,
        'tokens equal for same account',
      );
    });
  });

  describe('on updateStateNetworkType', function () {
    it('should remove a token from its state on corresponding network', async function () {
      network.providerStore.updateState({ type: 'mainnet' });
      await preferencesController.addToken('0xa', 'A', 4);
      await preferencesController.addToken('0xb', 'B', 5);
      const initialTokensFirst = preferencesController.getTokens();
      network.providerStore.updateState({ type: 'rinkeby' });
      await preferencesController.addToken('0xa', 'C', 4);
      await preferencesController.addToken('0xb', 'D', 5);
      const initialTokensSecond = preferencesController.getTokens();

      assert.notDeepEqual(
        initialTokensFirst,
        initialTokensSecond,
        'tokens not equal for different networks and tokens',
      );

      network.providerStore.updateState({ type: 'mainnet' });
      const tokensFirst = preferencesController.getTokens();
      network.providerStore.updateState({ type: 'rinkeby' });
      const tokensSecond = preferencesController.getTokens();
      assert.deepEqual(
        tokensFirst,
        initialTokensFirst,
        'tokens equal for same network',
      );
      assert.deepEqual(
        tokensSecond,
        initialTokensSecond,
        'tokens equal for same network',
      );
    });
  });

  describe('on watchAsset', function () {
    let stubHandleWatchAssetERC20, asy, req, res;
    const sandbox = sinon.createSandbox();

    beforeEach(function () {
      req = { params: {} };
      res = {};
      asy = { next: sandbox.spy(), end: sandbox.spy() };
      stubHandleWatchAssetERC20 = sandbox.stub(
        preferencesController,
        '_handleWatchAssetERC20',
      );
    });

    after(function () {
      sandbox.restore();
    });

    it('shouldn not do anything if method not corresponds', async function () {
      req.method = 'ecf-wallet';
      await preferencesController.requestWatchAsset(
        req,
        res,
        asy.next,
        asy.end,
      );
      sandbox.assert.notCalled(asy.end);
      sandbox.assert.called(asy.next);
    });

    it('should do something if method is supported', async function () {
      req.method = 'ecf_wallet_watchAsset';
      req.params.type = 'someasset';
      await preferencesController.requestWatchAsset(
        req,
        res,
        asy.next,
        asy.end,
      );
      sandbox.assert.called(asy.end);
      sandbox.assert.notCalled(asy.next);
      req.method = addInternalMethodPrefix('watchAsset');
      req.params.type = 'someasset';
      await preferencesController.requestWatchAsset(
        req,
        res,
        asy.next,
        asy.end,
      );
      sandbox.assert.calledTwice(asy.end);
      sandbox.assert.notCalled(asy.next);
    });

    it('should through error if method is supported but asset type is not', async function () {
      req.method = 'ecf_wallet_watchAsset';
      req.params.type = 'someasset';
      await preferencesController.requestWatchAsset(
        req,
        res,
        asy.next,
        asy.end,
      );
      sandbox.assert.called(asy.end);
      sandbox.assert.notCalled(stubHandleWatchAssetERC20);
      sandbox.assert.notCalled(asy.next);
      assert.deepEqual(res, {});
    });

    it('should trigger handle add asset if type supported', async function () {
      req.method = 'ecf_wallet_watchAsset';
      req.params.type = 'ERC20';
      await preferencesController.requestWatchAsset(
        req,
        res,
        asy.next,
        asy.end,
      );
      sandbox.assert.called(stubHandleWatchAssetERC20);
    });
  });

  describe('on watchAsset of type ERC20', function () {
    let req;

    const sandbox = sinon.createSandbox();

    beforeEach(function () {
      req = { params: { type: 'ERC20' } };
    });

    after(function () {
      sandbox.restore();
    });

    it('should add suggested token', async function () {
      const address = '0xd26114cd6ee289accf82350c8d8487fedb8a0c07';
      const symbol = 'ABBR';
      const decimals = 5;
      const image = 'https://cdn.test/abbr.png';
      const cached = 'data:image/png;base64,AAAA';
      req.params.options = { address, symbol, decimals, image };

      sandbox
        .stub(preferencesController, '_validateERC20AssetParams')
        .returns(true);
      preferencesController.openPopup = async () => undefined;
      const fetchImage = sinon.stub().resolves(cached);
      preferencesController.fetchImage = fetchImage;

      await preferencesController._handleWatchAssetERC20(req.params.options);
      const suggested = preferencesController.getSuggestedTokens();
      assert.equal(
        Object.keys(suggested).length,
        1,
        `one token added ${Object.keys(suggested)}`,
      );

      assert.equal(
        suggested[address].address,
        address,
        'set address correctly',
      );
      assert.equal(suggested[address].symbol, symbol, 'set symbol correctly');
      assert.equal(
        suggested[address].decimals,
        decimals,
        'set decimals correctly',
      );
      // The image is downloaded once and kept as a data URL.
      assert.deepEqual(fetchImage.firstCall.args, [image]);
      assert.equal(suggested[address].image, cached, 'set image correctly');
    });

    it('keeps a suggested image only as a data URL', async function () {
      const address = '0xd26114cd6ee289accf82350c8d8487fedb8a0c07';
      preferencesController.openPopup = async () => undefined;
      preferencesController.fetchImage = sinon.stub().resolves(undefined);
      const suggest = async (image) => {
        await preferencesController._handleWatchAssetERC20({
          address,
          symbol: 'ABC',
          decimals: 8,
          image,
        });
        return preferencesController.getSuggestedTokens()[address].image;
      };

      assert.equal(
        await suggest('data:image/png;base64,AAAA'),
        'data:image/png;base64,AAAA',
      );
      assert.equal(await suggest('https://cdn.test/missing.png'), undefined);
      assert.equal(await suggest('ipfs://bafy'), undefined);
      assert.equal(
        await suggest(`data:image/png;base64,${'A'.repeat(200000)}`),
        undefined,
      );
    });

    it('stores a token image only as a data URL', async function () {
      preferencesController.setAddresses(['0x7e57e2']);
      await preferencesController.setSelectedAddress('0x7e57e2');
      await preferencesController.addToken(
        '0xd26114cd6ee289accf82350c8d8487fedb8a0c07',
        'ABC',
        8,
        'https://cdn.test/abc.png',
      );
      assert.equal(
        preferencesController.getAssetImages()[
          '0xd26114cd6ee289accf82350c8d8487fedb8a0c07'
        ],
        undefined,
      );
    });

    it('downloads remote token images saved by an earlier version, and never shows their URLs', async function () {
      const fetchImage = sinon.stub();
      fetchImage
        .withArgs('https://cdn.test/a.png')
        .resolves('data:image/png;base64,AAAA');
      fetchImage.withArgs('https://cdn.test/b.png').resolves(undefined);
      const restored = new PreferencesController({
        network,
        fetchImage,
        initState: {
          assetImages: {
            '0xa': 'https://cdn.test/a.png',
            '0xb': 'https://cdn.test/b.png',
            '0xc': 'data:image/png;base64,CCCC',
          },
        },
      });
      assert.deepEqual(restored.getAssetImages(), {
        '0xc': 'data:image/png;base64,CCCC',
      });
      await restored.cachingAssetImages;
      assert.deepEqual(restored.getAssetImages(), {
        '0xa': 'data:image/png;base64,AAAA',
        '0xc': 'data:image/png;base64,CCCC',
      });
    });

    it('should validate ERC20 asset correctly', async function () {
      const validate = preferencesController._validateERC20AssetParams;

      assert.doesNotThrow(() =>
        validate({
          rawAddress: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
          symbol: 'ABC',
          decimals: 0,
        }),
      );
      assert.throws(
        () => validate({ symbol: 'ABC', decimals: 0 }),
        'missing address should fail',
      );
      assert.throws(
        () =>
          validate({
            rawAddress: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            decimals: 0,
          }),
        'missing symbol should fail',
      );
      assert.throws(
        () =>
          validate({
            rawAddress: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            symbol: 'ABC',
          }),
        'missing decimals should fail',
      );
      assert.throws(
        () =>
          validate({
            rawAddress: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            symbol: 'ABCDEFGHI',
            decimals: 0,
          }),
        'invalid symbol should fail',
      );
      assert.throws(
        () =>
          validate({
            rawAddress: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            symbol: 'ABC',
            decimals: -1,
          }),
        'decimals < 0 should fail',
      );
      assert.throws(
        () =>
          validate({
            rawAddress: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            symbol: 'ABC',
            decimals: 38,
          }),
        'decimals > 36 should fail',
      );
      assert.throws(
        () => validate({ rawAddress: '0x123', symbol: 'ABC', decimals: 0 }),
        'invalid address should fail',
      );
      assert.throws(
        () =>
          validate({
            rawAddress: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            symbol: { length: 1 },
            decimals: 0,
          }),
        /not a string/u,
        'a symbol that is not a string should fail',
      );
      assert.throws(
        () =>
          validate({
            rawAddress: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            symbol: ['A', 'B'],
            decimals: 0,
          }),
        /not a string/u,
        'an array symbol should fail',
      );
      assert.throws(
        () =>
          validate({
            rawAddress: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
            symbol: 'ABC',
            decimals: 0,
            image: { src: 'x' },
          }),
        /not a string/u,
        'an image that is not a string should fail',
      );
    });

    it('does not save a suggestion that is not a string', async function () {
      preferencesController.openPopup = async () => undefined;
      const result = await preferencesController._handleWatchAssetERC20({
        address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
        symbol: { length: 1 },
        decimals: 18,
      });
      assert.ok(result instanceof Error);
      assert.deepEqual(preferencesController.getSuggestedTokens(), {});
    });

    it('does not reload a saved suggestion', function () {
      const restored = new PreferencesController({
        network,
        initState: {
          suggestedTokens: {
            '0xd26114cd6ee289accf82350c8d8487fedb8a0c07': {
              address: '0xd26114cd6ee289accf82350c8d8487fedb8a0c07',
              symbol: { length: 1 },
              decimals: 18,
            },
          },
        },
      });
      assert.deepEqual(restored.getSuggestedTokens(), {});
    });

    describe('checked against the token contract', function () {
      const address = '0xd26114cd6ee289accf82350c8d8487fedb8a0c07';

      function useContract({ symbol, decimals }) {
        const results = {
          // symbol() and decimals() selectors
          '0x95d89b41':
            symbol === undefined
              ? '0x'
              : bytesToHex(encode(['string'], [symbol])),
          '0x313ce567':
            decimals === undefined
              ? '0x'
              : bytesToHex(encode(['uint256'], [BigInt(decimals)])),
        };
        preferencesController.getProvider = () => ({
          sendAsync: (request, callback) =>
            callback(null, {
              id: request.id,
              jsonrpc: '2.0',
              result: results[request.params[0].data],
            }),
        });
        preferencesController.openPopup = async () => undefined;
      }

      it("refuses a request that disagrees with the contract's decimals", async function () {
        useContract({ symbol: 'USDC', decimals: 6 });
        const result = await preferencesController._handleWatchAssetERC20({
          address,
          symbol: 'USDC',
          decimals: 18,
        });
        assert.match(result.message, /do not match the decimals/u);
        assert.deepEqual(preferencesController.getSuggestedTokens(), {});
      });

      it("refuses a request that disagrees with the contract's symbol", async function () {
        useContract({ symbol: 'USDC', decimals: 6 });
        const result = await preferencesController._handleWatchAssetERC20({
          address,
          symbol: 'USDT',
          decimals: 6,
        });
        assert.match(result.message, /does not match the symbol/u);
      });

      it("uses the contract's values and saves decimals as a number", async function () {
        useContract({ symbol: 'USDC', decimals: 6 });
        await preferencesController._handleWatchAssetERC20({
          address,
          symbol: 'usdc',
          decimals: '6',
        });
        const suggested = preferencesController.getSuggestedTokens()[address];
        assert.equal(suggested.symbol, 'USDC');
        assert.strictEqual(suggested.decimals, 6);
      });

      it('falls back to the request when the contract returns nothing', async function () {
        useContract({});
        await preferencesController._handleWatchAssetERC20({
          address,
          symbol: 'ABC',
          decimals: 8,
        });
        const suggested = preferencesController.getSuggestedTokens()[address];
        assert.equal(suggested.symbol, 'ABC');
        assert.strictEqual(suggested.decimals, 8);
      });
    });
  });

  describe('#updateRpc', function () {
    it('should update the rpcDetails properly', function () {
      preferencesController.store.updateState({
        frequentRpcListDetail: [{}, { rpcUrl: 'test' }, {}],
      });
      preferencesController.updateRpc({ rpcUrl: 'test', chainId: '1' });
      preferencesController.updateRpc({ rpcUrl: 'test/1', chainId: '1' });
      preferencesController.updateRpc({ rpcUrl: 'test/2', chainId: '1' });
      preferencesController.updateRpc({ rpcUrl: 'test/3', chainId: '1' });
      const list = preferencesController.getFrequentRpcListDetail();
      assert.deepEqual(list[1], { rpcUrl: 'test', chainId: '1' });
    });
  });

  describe('on updateFrequentRpcList', function () {
    it('should add custom RPC url to state', function () {
      preferencesController.addToFrequentRpcList('rpc_url', '1');
      preferencesController.addToFrequentRpcList('http://localhost:8545', '1');
      assert.deepEqual(
        preferencesController.store.getState().frequentRpcListDetail,
        [
          {
            rpcUrl: 'rpc_url',
            chainId: '1',
            ticker: 'ETH',
            nickname: '',
            rpcPrefs: {},
          },
        ],
      );
      preferencesController.addToFrequentRpcList('rpc_url', '1');
      assert.deepEqual(
        preferencesController.store.getState().frequentRpcListDetail,
        [
          {
            rpcUrl: 'rpc_url',
            chainId: '1',
            ticker: 'ETH',
            nickname: '',
            rpcPrefs: {},
          },
        ],
      );
    });

    it('refuses a custom RPC without a valid chain ID', function () {
      const controller = preferencesController;
      controller.addToFrequentRpcList('rpc_url', '0x89');
      for (const chainId of [undefined, '', '1abc', '0']) {
        assert.throws(
          () => controller.addToFrequentRpcList('rpc_url', chainId),
          /needs a valid chain ID/u,
        );
        assert.throws(
          () => controller.updateRpc({ rpcUrl: 'rpc_url', chainId }),
          /needs a valid chain ID/u,
        );
      }
      // The saved entry is left as it was.
      assert.deepEqual(
        preferencesController.store
          .getState()
          .frequentRpcListDetail.map(({ rpcUrl, chainId }) => ({
            rpcUrl,
            chainId,
          })),
        [{ rpcUrl: 'rpc_url', chainId: '0x89' }],
      );
    });

    it('should remove custom RPC url from state', function () {
      preferencesController.addToFrequentRpcList('rpc_url', '1');
      assert.deepEqual(
        preferencesController.store.getState().frequentRpcListDetail,
        [
          {
            rpcUrl: 'rpc_url',
            chainId: '1',
            ticker: 'ETH',
            nickname: '',
            rpcPrefs: {},
          },
        ],
      );
      preferencesController.removeFromFrequentRpcList('other_rpc_url');
      preferencesController.removeFromFrequentRpcList('http://localhost:8545');
      preferencesController.removeFromFrequentRpcList('rpc_url');
      assert.deepEqual(
        preferencesController.store.getState().frequentRpcListDetail,
        [],
      );
    });
  });

  describe('setUsePhishDetect', function () {
    it('should set the usePhishDetect property in state', function () {
      assert.equal(preferencesController.store.getState().usePhishDetect, true);
      preferencesController.setUsePhishDetect(false);
      assert.equal(
        preferencesController.store.getState().usePhishDetect,
        false,
      );
    });
  });
});
