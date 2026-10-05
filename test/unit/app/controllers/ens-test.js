import { bytesToHex } from '@ethereumjs/util';
import { encode } from '@metamask/abi-utils';
import assert from 'assert';
import namehash from 'eth-ens-namehash';

import Ens from '../../../../app/scripts/controllers/ens/ens';

const REGISTRY = '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e';
const RESOLVER = '0x4976fb03c32e5b8cfe2b6ccb31c09ba78ebaba41';
const ACCOUNT = '0xd8da6bf26964af9d7eed9e10e5d4524c2be3c3c4';

const SELECTORS = {
  resolver: '0x0178b8bf',
  addr: '0x3b3b57de',
  name: '0x691f3431',
};

/**
 * A provider that answers eth_call for one ENS name and its reverse record.
 *
 * @param {object} records - Return values by contract and selector
 * @returns {object} The provider and the calls it received
 */
function stubProvider(records) {
  const calls = [];
  return {
    calls,
    provider: {
      sendAsync(payload, callback) {
        const [{ to, data }] = payload.params;
        calls.push({ to, data });
        const result = records[`${to.toLowerCase()}:${data.slice(0, 10)}`];
        callback(null, {
          id: payload.id,
          jsonrpc: '2.0',
          result:
            result ??
            bytesToHex(
              encode(
                ['address'],
                ['0x0000000000000000000000000000000000000000'],
              ),
            ),
        });
      },
    },
  };
}

describe('Ens', function () {
  const node = namehash.hash('vitalik.eth');
  const reverseNode = namehash.hash(`${ACCOUNT.slice(2)}.addr.reverse`);

  it('resolves a name through the registry and its resolver', async function () {
    const { provider, calls } = stubProvider({
      [`${REGISTRY}:${SELECTORS.resolver}`]: bytesToHex(
        encode(['address'], [RESOLVER]),
      ),
      [`${RESOLVER}:${SELECTORS.addr}`]: bytesToHex(
        encode(['address'], [ACCOUNT]),
      ),
    });
    const address = await new Ens({ network: '1', provider }).lookup(
      'vitalik.eth',
    );
    assert.equal(address, ACCOUNT);
    assert.deepEqual(
      calls.map(({ to, data }) => [to.toLowerCase(), data]),
      [
        [REGISTRY, `${SELECTORS.resolver}${node.slice(2)}`],
        [RESOLVER, `${SELECTORS.addr}${node.slice(2)}`],
      ],
    );
  });

  it('reports a name with no resolver as not defined', async function () {
    const { provider } = stubProvider({});
    await assert.rejects(
      new Ens({ network: '1', provider }).lookup('nobody.eth'),
      { message: 'ENS name not defined.' },
    );
  });

  it('looks up the name an address claims', async function () {
    const { provider, calls } = stubProvider({
      [`${REGISTRY}:${SELECTORS.resolver}`]: bytesToHex(
        encode(['address'], [RESOLVER]),
      ),
      [`${RESOLVER}:${SELECTORS.name}`]: bytesToHex(
        encode(['string'], ['vitalik.eth']),
      ),
    });
    const name = await new Ens({ network: '1', provider }).reverse(ACCOUNT);
    assert.equal(name, 'vitalik.eth');
    assert.equal(calls[1].data, `${SELECTORS.name}${reverseNode.slice(2)}`);
  });
});
