import { strict as assert } from 'assert';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

const IPFS_CID = 'bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4';
const SWARM_REF =
  'd1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162';
const ONION3 = 'duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad';
const ZERONET = '1HeLLo4uzjaLetFx6NH3PMwFP3qbRbTf3D';

describe('ENS website resolution', function () {
  let resolve, tabs, gatewayStatus, setupEnsIpfsResolver, module;

  beforeEach(function () {
    resolve = sinon.stub();
    gatewayStatus = 200;
    tabs = {
      update: sinon.stub().resolves(),
      query: sinon.stub().resolves([{ id: 7 }]),
      create: sinon.stub().resolves({ id: 9 }),
    };
    module = proxyquire('../../../../app/scripts/lib/ens-ipfs/setup', {
      './resolver': { default: resolve },
      '../extension-api': { default: { tabs } },
      '../browser-global': {
        default: { fetch: async () => ({ status: gatewayStatus }) },
      },
    });
    setupEnsIpfsResolver = module.default;
  });

  async function open(text, disposition = 'currentTab') {
    const { open: openName } = setupEnsIpfsResolver({
      provider: {},
      getIpfsGateway: () => 'dweb.link',
    });
    await openName(text, disposition);
    return tabs.update.lastCall?.args;
  }

  it('sends the tab to the address the content hash names', async function () {
    const cases = [
      [
        { type: 'ipfs-ns', hash: IPFS_CID },
        `https://${IPFS_CID}.ipfs.dweb.link/a?b#c`,
      ],
      [{ type: 'onion3', hash: ONION3 }, `http://${ONION3}.onion/a?b#c`],
      [
        { type: 'zeronet', hash: ZERONET },
        `http://127.0.0.1:43110/${ZERONET}/a?b#c`,
      ],
    ];
    for (const [resolved, expected] of cases) {
      resolve.resolves(resolved);
      assert.deepEqual(await open('site.eth/a?b#c'), [7, { url: expected }]);
    }
  });

  it('shows the loading page first, in the tab the user chose', async function () {
    resolve.resolves({ type: 'ipfs-ns', hash: IPFS_CID });
    await open('site.eth', 'currentTab');
    assert.deepEqual(tabs.update.firstCall.args, [7, { url: 'loading.html' }]);

    await open('site.eth', 'newBackgroundTab');
    assert.deepEqual(tabs.create.lastCall.args, [
      { url: 'loading.html', active: false },
    ]);
    assert.equal(tabs.update.lastCall.args[0], 9);
  });

  it('shows the name on the ENS app when the content hash is malformed', async function () {
    for (const resolved of [
      // Would redirect to a site that is not an onion service.
      { type: 'onion3', hash: 'evil.com/x#' },
      { type: 'onion', hash: 'evil.com/x#' },
      // Would leave ZeroNet's path for any path on that port.
      { type: 'zeronet', hash: '../../x?' },
      { type: 'ipfs-ns', hash: 'evil.com/x#' },
      { type: 'ipns-ns', hash: 'Uppercase.Name' },
      { type: 'unknown', hash: IPFS_CID },
      // No Swarm gateway is used.
      { type: 'swarm-ns', hash: SWARM_REF },
    ]) {
      resolve.resolves(resolved);
      assert.deepEqual(
        await open('site.eth/'),
        [7, { url: 'https://app.ens.domains/name/site.eth' }],
        JSON.stringify(resolved),
      );
    }
  });

  it('shows the name on the ENS app when the gateway lacks the content or the lookup fails', async function () {
    gatewayStatus = 404;
    resolve.resolves({ type: 'ipfs-ns', hash: IPFS_CID });
    assert.deepEqual(await open('site.eth'), [
      7,
      { url: 'https://app.ens.domains/name/site.eth' },
    ]);
    resolve.rejects(new Error('no resolver'));
    assert.deepEqual(await open('site.eth'), [
      7,
      { url: 'https://app.ens.domains/name/site.eth' },
    ]);
  });

  it('ignores text that is not a .eth address', async function () {
    for (const text of ['', 'two words', 'example.com', 'user@site.eth']) {
      tabs.update.resetHistory();
      assert.equal(await open(text), undefined, text);
      assert.equal(resolve.callCount, 0, text);
    }
  });

  it('reads the name and the rest of the address', function () {
    const { parseEnsInput } = module;
    assert.deepEqual(parseEnsInput('  https://Site.eth/a?b#c '), {
      name: 'site.eth',
      hostname: 'site.eth',
      path: '/a',
      search: '?b',
      fragment: '#c',
    });
    assert.equal(parseEnsInput('vitalik').name, 'vitalik.eth');
    assert.equal(parseEnsInput('xn--mnchen-3ya.eth').name, 'münchen.eth');
    assert.equal(parseEnsInput('site.eth:8080'), null);
    assert.equal(parseEnsInput('.eth'), null);
  });

  it('recognizes well-formed content hashes', function () {
    const { isValidContentHash } = module;
    assert.equal(isValidContentHash('ipfs-ns', IPFS_CID), true);
    assert.equal(isValidContentHash('swarm-ns', SWARM_REF), false);
    assert.equal(isValidContentHash('onion', 'expyuzz4wqqyqhjn'), true);
    assert.equal(isValidContentHash('onion3', ONION3), true);
    assert.equal(isValidContentHash('zeronet', ZERONET), true);
    assert.equal(isValidContentHash('onion3', ONION3.slice(1)), false);
    assert.equal(
      isValidContentHash('zeronet', '0HeLLo4uzjaLetFx6NH3PMwFP3qbRbTf3D'),
      false,
    );
    assert.equal(isValidContentHash('ipfs-ns', undefined), false);
  });
});
