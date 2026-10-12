import { ObservableStore } from '@metamask/obs-store';
import { strict as assert } from 'assert';
import nock from 'nock';
import sinon from 'sinon';

import NftsController, {
  NFT_IMAGE_MAX_BYTES,
  nftImageUrl,
} from '../../../../app/scripts/controllers/nfts';

const ACCOUNT = '0x1234567890123456789012345678901234567890';
const CONTRACT = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D';
const API = 'https://nft.api.cx.metamask.io';

class MemoryImageStore {
  constructor() {
    this.images = new Map();
  }

  async has(key) {
    return this.images.has(key);
  }

  async get(keys) {
    return Object.fromEntries(
      keys
        .filter((key) => this.images.has(key))
        .map((key) => [key, this.images.get(key)]),
    );
  }

  async set(key, value) {
    this.images.set(key, value);
  }

  async clear() {
    this.images.clear();
  }
}

function apiToken(tokenId, overrides = {}) {
  return {
    token: {
      tokenId,
      contract: CONTRACT.toLowerCase(),
      kind: 'erc721',
      name: `Ape #${tokenId}`,
      image: `https://img.test/${tokenId}.png`,
      imageSmall: `https://img.test/${tokenId}-small.png`,
      collection: { name: 'Apes', symbol: 'APE' },
      chainId: 1,
      isSpam: false,
      metadata: {},
      ...overrides,
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('NftsController', function () {
  let preferencesStore, chainId, imageStore, fetchImage, controller;

  beforeEach(function () {
    preferencesStore = new ObservableStore({
      selectedAddress: ACCOUNT,
      useNftDetection: false,
      displayNftMedia: false,
      ipfsGateway: 'dweb.link',
    });
    chainId = '0x1';
    imageStore = new MemoryImageStore();
    fetchImage = sinon
      .stub()
      .callsFake(async (url) => `data:image/png;base64,${btoa(url)}`);
    controller = new NftsController({
      preferencesStore,
      getChainId: () => chainId,
      getProvider: () => ({}),
      isPhishing: (url) => new URL(url).hostname === 'evil.test',
      imageStore,
      fetchImage,
    });
  });

  afterEach(function () {
    nock.cleanAll();
  });

  const enable = (state) => {
    preferencesStore.updateState(state);
  };
  const nfts = () => controller.store.getState().allNfts[ACCOUNT]?.['0x1'];

  it('asks no one for NFTs while detection is off', async function () {
    // nock refuses every unmocked request, so any request would throw.
    await controller.detectNfts();
    assert.deepEqual(controller.store.getState().allNfts, {});
  });

  it('asks the NFT API for the selected account on a supported network', async function () {
    enable({ useNftDetection: true });
    const api = nock(API)
      .get(`/users/${ACCOUNT}/tokens`)
      .query((query) => query.chainIds === '1')
      .reply(200, {
        tokens: [apiToken('1'), apiToken('2', { isSpam: true })],
        continuation: null,
      });

    await controller.detectNfts();

    assert.ok(api.isDone());
    assert.deepEqual(
      nfts().map(({ tokenId, name }) => [tokenId, name]),
      [['1', 'Ape #1']],
    );
    // Images are a separate choice.
    assert.equal(fetchImage.called, false);
  });

  it('never sends the account for a testnet or a custom network', async function () {
    enable({ useNftDetection: true });
    for (chainId of ['0xaa36a7', '0x539', '0x38']) {
      await controller.detectNfts();
    }
    assert.deepEqual(controller.store.getState().allNfts, {});
  });

  it('drops links to sites on the phishing list', async function () {
    enable({ useNftDetection: true });
    nock(API)
      .get(`/users/${ACCOUNT}/tokens`)
      .query(true)
      .reply(200, {
        tokens: [apiToken('1', { image: 'https://evil.test/1.png' })],
        continuation: null,
      });

    await controller.detectNfts();

    assert.equal(nfts()[0].image, undefined);
    assert.equal(nfts()[0].imageThumbnail, 'https://img.test/1-small.png');
  });

  it('downloads each image once, only when allowed', async function () {
    enable({ useNftDetection: true, displayNftMedia: true });
    const reply = {
      tokens: [
        apiToken('1'),
        apiToken('2', { imageSmall: undefined }),
        apiToken('3', {
          imageSmall: undefined,
          image: 'data:image/svg+xml;base64,PHN2Zy8+',
        }),
      ],
      continuation: null,
    };
    nock(API)
      .get(`/users/${ACCOUNT}/tokens`)
      .query(true)
      .twice()
      .reply(200, reply);

    await controller.detectNfts();
    await controller.detectNfts();

    assert.deepEqual(
      fetchImage.args.map(([url, options]) => [url, options.maxBytes]),
      [
        ['https://img.test/1-small.png', NFT_IMAGE_MAX_BYTES],
        ['https://img.test/2.png', NFT_IMAGE_MAX_BYTES],
      ],
    );
    const key = `0x1:${CONTRACT.toLowerCase()}:1`;
    assert.deepEqual(await controller.getNftImages([key]), {
      [key]: `data:image/png;base64,${btoa('https://img.test/1-small.png')}`,
    });
    // On-chain art is kept as it is, with no download.
    const onChain = `0x1:${CONTRACT.toLowerCase()}:3`;
    assert.equal(
      imageStore.images.get(onChain),
      'data:image/svg+xml;base64,PHN2Zy8+',
    );
    assert.ok(controller.imagesStore.getState().nftImagesVersion > 0);
  });

  it('deletes the images and forgets the list when turned off', async function () {
    enable({ useNftDetection: true, displayNftMedia: true });
    nock(API)
      .get(`/users/${ACCOUNT}/tokens`)
      .query(true)
      .reply(200, { tokens: [apiToken('1')], continuation: null });
    await controller.detectNfts();
    assert.equal(imageStore.images.size, 1);

    enable({ displayNftMedia: false });
    await flush();
    assert.equal(imageStore.images.size, 0);
    assert.equal(nfts().length, 1);
    assert.deepEqual(await controller.getNftImages(['anything']), {});

    enable({ useNftDetection: false });
    await flush();
    assert.deepEqual(controller.store.getState().allNfts, {});
  });

  it('downloads the images of detected NFTs when images are turned on later', async function () {
    enable({ useNftDetection: true });
    nock(API)
      .get(`/users/${ACCOUNT}/tokens`)
      .query(true)
      .reply(200, { tokens: [apiToken('1')], continuation: null });
    await controller.detectNfts();
    assert.equal(fetchImage.called, false);

    enable({ displayNftMedia: true });
    await flush();
    await controller._caching;
    assert.equal(fetchImage.callCount, 1);
  });

  it('turns IPFS images into gateway URLs and refuses other schemes', function () {
    assert.equal(
      nftImageUrl(
        'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/1.png',
        'dweb.link',
      ),
      'https://bafybeie5nqv6kd3qnfjupgvz34woh3oksc3iau6abmyajn7qvtf6d2ho34.ipfs.dweb.link/1.png',
    );
    assert.equal(
      nftImageUrl(
        'ipfs://ipfs/bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4',
        'dweb.link',
      ),
      'https://bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4.ipfs.dweb.link',
    );
    assert.equal(
      nftImageUrl('https://img.test/a.png'),
      'https://img.test/a.png',
    );
    for (const url of [
      'http://img.test/a.png',
      'data:image/png;base64,AAAA',
      'ipfs://not-a-cid/a.png',
      undefined,
    ]) {
      assert.equal(nftImageUrl(url, 'dweb.link'), undefined, String(url));
    }
  });
});
