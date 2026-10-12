import { strict as assert } from 'assert';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

const IPFS_CID = 'bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4';
const SWARM_REF =
  'd1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162';
const ONION3 = 'duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad';
const ZERONET = '1HeLLo4uzjaLetFx6NH3PMwFP3qbRbTf3D';

describe('ENS website resolution', function () {
  let resolve, updateTab, setupEnsIpfsResolver, isValidContentHash;

  beforeEach(function () {
    resolve = sinon.stub();
    updateTab = sinon.stub().resolves();
    ({ default: setupEnsIpfsResolver, isValidContentHash } = proxyquire(
      '../../../../app/scripts/lib/ens-ipfs/setup',
      {
        './resolver': { default: resolve },
        '../extension-api': { default: { tabs: { update: updateTab } } },
        '../browser-global': {
          default: { fetch: async () => ({ status: 200 }) },
        },
      },
    ));
  });

  async function visit(url) {
    const { handleRequest } = setupEnsIpfsResolver({
      provider: {},
      getCurrentNetwork: () => '1',
      getIpfsGateway: () => 'dweb.link',
    });
    await handleRequest({ tabId: 7, url });
    // The resolution runs after the request handler returns.
    await new Promise((resolveWait) => setTimeout(resolveWait, 0));
    return updateTab.lastCall.args;
  }

  it('sends the tab to the address the content hash names', async function () {
    const cases = [
      [
        { type: 'ipfs-ns', hash: IPFS_CID },
        `https://${IPFS_CID}.ipfs.dweb.link/a?b#c`,
      ],
      [
        { type: 'swarm-ns', hash: SWARM_REF },
        `https://swarm-gateways.net/bzz:/${SWARM_REF}/a?b#c`,
      ],
      [{ type: 'onion3', hash: ONION3 }, `http://${ONION3}.onion/a?b#c`],
      [
        { type: 'zeronet', hash: ZERONET },
        `http://127.0.0.1:43110/${ZERONET}/a?b#c`,
      ],
    ];
    for (const [resolved, expected] of cases) {
      resolve.resolves(resolved);
      assert.deepEqual(await visit('http://site.eth/a?b#c'), [
        7,
        { url: expected },
      ]);
    }
  });

  it('shows the name on the ENS app when the content hash is malformed', async function () {
    for (const resolved of [
      // Would redirect to a site that is not an onion service.
      { type: 'onion3', hash: 'evil.com/x#' },
      { type: 'onion', hash: 'evil.com/x#' },
      // Would leave ZeroNet's path for any path on that port.
      { type: 'zeronet', hash: '../../x?' },
      { type: 'swarm-ns', hash: 'abc/def' },
      { type: 'ipfs-ns', hash: 'evil.com/x#' },
      { type: 'ipns-ns', hash: 'Uppercase.Name' },
      { type: 'unknown', hash: IPFS_CID },
    ]) {
      resolve.resolves(resolved);
      assert.deepEqual(
        await visit('http://site.eth/'),
        [7, { url: 'https://app.ens.domains/name/site.eth' }],
        JSON.stringify(resolved),
      );
    }
  });

  it('recognizes well-formed content hashes', function () {
    assert.equal(isValidContentHash('ipfs-ns', IPFS_CID), true);
    assert.equal(isValidContentHash('swarm-ns', SWARM_REF.repeat(2)), true);
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
