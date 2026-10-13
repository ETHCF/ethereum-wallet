import { strict as assert } from 'assert';
import proxyquire from 'proxyquire';

const RESOLVER = '0x4976fb03c32e5b8cfe2b6ccb31c09ba78ebaba41';

// Content hashes as an ENS resolver's contenthash(bytes32) returns them.
const IPFS_HASH =
  '0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f';
const IPNS_HASH =
  '0xe5010172002408011220e4680b2f8c8d21090e6aa327f1bb342ab8e7d9238f1e35831a54d6a8f5c91124';
const SWARM_HASH =
  '0xe40101fa011b20d1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162';

describe('ENS content hash resolution', function () {
  const resolveWith = (contentHash) => {
    const { default: resolve } = proxyquire(
      '../../../../app/scripts/lib/ens-ipfs/resolver',
      {
        '@metamask/eth-query': {
          __esModule: true,
          default: class {
            sendAsync(_, cb) {
              cb(null, '1');
            }
          },
        },
        '../contract-call': {
          callContract: async (_query, _to, signature) => {
            if (signature === 'resolver(bytes32)') {
              return [RESOLVER];
            }
            if (signature === 'supportsInterface(bytes4)') {
              return [true];
            }
            return [contentHash];
          },
        },
      },
    );
    return resolve({ provider: {}, name: 'example.eth' });
  };

  it('returns an IPFS CID as base32 CIDv1', async function () {
    assert.deepEqual(await resolveWith(IPFS_HASH), {
      type: 'ipfs-ns',
      hash: 'bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4',
    });
  });

  it('returns an IPNS name as a base36 libp2p key', async function () {
    assert.deepEqual(await resolveWith(IPNS_HASH), {
      type: 'ipns-ns',
      hash: 'k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8',
    });
  });

  it('returns a Swarm reference as hex', async function () {
    assert.deepEqual(await resolveWith(SWARM_HASH), {
      type: 'swarm-ns',
      hash: 'd1de9994b4d039f6548d191eb26786769f580809256b4685ef316805265ea162',
    });
  });
});
