import { bytesToHex, hexToBytes } from '@ethereumjs/util';
import { decode, encode } from '@metamask/abi-utils';
import assert from 'assert';
import namehashLegacy from 'eth-ens-namehash';
import sinon from 'sinon';

import Ens, {
  dnsEncode,
  findOffchainLookup,
  namehash,
  normalizeEnsName,
} from '../../../../app/scripts/controllers/ens/ens';
import { functionSelector } from '../../../../app/scripts/lib/abi-method-decoder';

const REGISTRY = '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e';
const RESOLVER = '0x4976fb03c32e5b8cfe2b6ccb31c09ba78ebaba41';
const OTHER_CONTRACT = '0x1111111111111111111111111111111111111111';
const ACCOUNT = '0xd8da6bf26964af9d7eed9e10e5d4524c2be3c3c4';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
// An emoji sequence joined by zero-width joiners.
const FAMILY = '\u{1f468}\u200d\u{1f469}\u200d\u{1f467}.eth';

const SELECTORS = {
  resolver: '0x0178b8bf',
  addr: '0x3b3b57de',
  name: '0x691f3431',
  supportsInterface: '0x01ffc9a7',
  resolve: '0x9061b923',
};
const CALLBACK = `0x${functionSelector('resolveWithProof(bytes,bytes)')}`;

const abi = (types, values) => bytesToHex(encode(types, values));
const args = (types, data) =>
  decode(types, hexToBytes(`0x${data.slice(10)}`)).map((value) =>
    value instanceof Uint8Array ? bytesToHex(value) : value,
  );

/**
 * The error an eth_call revert reaches Ens with: the fetch middleware wraps
 * the endpoint's error in an internal error, which the engine serializes.
 *
 * @param {string} data - The revert data
 * @returns {object} The serialized error
 */
const revertError = (data) => ({
  code: -32603,
  message: 'Internal JSON-RPC error.',
  data: { code: 3, message: 'execution reverted', data },
});

const offchainLookup = ({
  sender = RESOLVER,
  urls = ['https://gateway.example/{sender}/{data}.json'],
  callData = '0xdeadbeef',
  extraData = '0x1234',
} = {}) =>
  `0x556f1830${abi(
    ['address', 'string[]', 'bytes', 'bytes4', 'bytes'],
    [sender, urls, callData, CALLBACK, extraData],
  ).slice(2)}`;

/**
 * A provider that answers eth_call through a handler.
 *
 * @param {Function} handler - Takes (to, data) and returns the result, or
 * throws the RPC error
 * @returns {object} The provider and the calls it received
 */
function fakeProvider(handler) {
  const calls = [];
  return {
    calls,
    provider: {
      sendAsync(payload, callback) {
        const [{ to, data }] = payload.params;
        calls.push({ to: to.toLowerCase(), data });
        const reply = { id: payload.id, jsonrpc: '2.0' };
        let response;
        try {
          response = { ...reply, result: handler(to.toLowerCase(), data) };
        } catch (error) {
          response = { ...reply, error };
        }
        callback(null, response);
      },
    },
  };
}

/**
 * A chain with one resolver, set on `resolverName`.
 *
 * @param {object} options - Options
 * @param {string} options.resolverName - The name the resolver is set on
 * @param {boolean} [options.wildcard] - Whether it supports ENSIP-10
 * @param {Function} [options.resolve] - Answers resolve(name, data)
 * @param {object} [options.records] - Answers by selector, for other calls
 * @returns {Function} An eth_call handler
 */
function chain({ resolverName, wildcard = false, resolve, records = {} }) {
  return (to, data) => {
    const selector = data.slice(0, 10);
    if (to === REGISTRY && selector === SELECTORS.resolver) {
      const [node] = args(['bytes32'], data);
      return abi(
        ['address'],
        [node === namehash(resolverName) ? RESOLVER : ZERO_ADDRESS],
      );
    }
    if (to !== RESOLVER) {
      return '0x';
    }
    if (selector === SELECTORS.supportsInterface) {
      return abi(
        ['bool'],
        [wildcard && args(['bytes4'], data)[0] === SELECTORS.resolve],
      );
    }
    if (selector === SELECTORS.resolve && resolve) {
      return resolve(...args(['bytes', 'bytes'], data));
    }
    if (records[selector]) {
      return records[selector](data);
    }
    return '0x';
  };
}

describe('Ens', function () {
  it('computes the same namehash as before for ASCII names', function () {
    for (const name of ['', 'eth', 'vitalik.eth', 'a.b.cb.id']) {
      assert.equal(namehash(name), namehashLegacy.hash(name));
    }
  });

  it('encodes names in DNS wire format', function () {
    assert.equal(
      bytesToHex(dnsEncode('alice.cb.id')),
      '0x05616c69636502636202696400',
    );
  });

  describe('normalizeEnsName', function () {
    it('normalizes as ENSIP-15 describes', function () {
      assert.equal(normalizeEnsName('Nick.ETH'), 'nick.eth');
      assert.equal(normalizeEnsName('💩.eth'), '💩.eth');
      // Ignored characters are dropped, so the name looked up is the one seen.
      assert.equal(normalizeEnsName('vita\u200blik.eth'), 'vitalik.eth');
      // A zero-width joiner inside an emoji sequence is part of the emoji.
      assert.equal(normalizeEnsName(FAMILY), FAMILY);
    });

    it('refuses confusable, invisible and disallowed characters', function () {
      for (const name of [
        // Latin with one Cyrillic "а".
        'vitаlik.eth',
        'evil\u202eexe.eth',
        'a..eth',
        'xn--abc.eth',
        '',
        undefined,
      ]) {
        assert.throws(() => normalizeEnsName(name), { code: 'invalidName' });
      }
    });
  });

  it('finds OffchainLookup data however the error is wrapped', function () {
    const data = offchainLookup();
    assert.equal(findOffchainLookup(revertError(data)), data);
    assert.equal(findOffchainLookup({ data }), data);
    assert.equal(
      findOffchainLookup({ error: { data: { originalError: { data } } } }),
      data,
    );
    assert.equal(findOffchainLookup(revertError('0x08c379a0')), undefined);
    assert.equal(findOffchainLookup(new Error('timeout')), undefined);
  });

  it('resolves a name through the registry and its resolver', async function () {
    const node = namehash('vitalik.eth');
    const { provider, calls } = fakeProvider(
      chain({
        resolverName: 'vitalik.eth',
        records: { [SELECTORS.addr]: () => abi(['address'], [ACCOUNT]) },
      }),
    );
    const address = await new Ens({ network: '1', provider }).lookup(
      'Vitalik.eth',
    );
    assert.equal(address, ACCOUNT);
    assert.deepEqual(
      calls.map(({ to, data }) => [to, data.slice(0, 10)]),
      [
        [REGISTRY, SELECTORS.resolver],
        [RESOLVER, SELECTORS.supportsInterface],
        [RESOLVER, SELECTORS.addr],
      ],
    );
    assert.equal(calls[2].data, `${SELECTORS.addr}${node.slice(2)}`);
  });

  it('works on Sepolia but not on networks without ENS', function () {
    const { provider } = fakeProvider(() => '0x');
    assert.ok(new Ens({ network: '11155111', provider }));
    assert.throws(() => new Ens({ network: '137', provider }));
    assert.throws(() => new Ens({ network: '5', provider }));
  });

  it('reports a name with no resolver as not defined', async function () {
    const { provider } = fakeProvider(chain({ resolverName: 'other.eth' }));
    await assert.rejects(
      new Ens({ network: '1', provider }).lookup('nobody.eth'),
      { message: 'ENS name not defined.', code: 'notFound' },
    );
  });

  it('refuses an invalid name without asking the network', async function () {
    const { provider, calls } = fakeProvider(() => '0x');
    await assert.rejects(
      new Ens({ network: '1', provider }).lookup('vitаlik.eth'),
      { code: 'invalidName' },
    );
    assert.equal(calls.length, 0);
  });

  describe('wildcard resolution (ENSIP-10)', function () {
    it('resolves a subname through its parent’s resolver', async function () {
      const resolve = sinon.spy((name, data) => {
        assert.equal(name, bytesToHex(dnsEncode('alice.cb.id')));
        assert.equal(
          data,
          `${SELECTORS.addr}${namehash('alice.cb.id').slice(2)}`,
        );
        return abi(['bytes'], [abi(['address'], [ACCOUNT])]);
      });
      const { provider, calls } = fakeProvider(
        chain({ resolverName: 'cb.id', wildcard: true, resolve }),
      );
      const address = await new Ens({ network: '1', provider }).lookup(
        'alice.cb.id',
      );
      assert.equal(address, ACCOUNT);
      assert.ok(resolve.calledOnce);
      // The registry is asked about alice.cb.id, then cb.id.
      assert.deepEqual(
        calls
          .filter(({ to }) => to === REGISTRY)
          .map(({ data }) => args(['bytes32'], data)[0]),
        [namehash('alice.cb.id'), namehash('cb.id')],
      );
    });

    it('does not use a parent’s resolver that does not support wildcards', async function () {
      const { provider } = fakeProvider(
        chain({
          resolverName: 'cb.id',
          records: { [SELECTORS.addr]: () => abi(['address'], [ACCOUNT]) },
        }),
      );
      await assert.rejects(
        new Ens({ network: '1', provider }).lookup('alice.cb.id'),
        { code: 'notFound' },
      );
    });

    it('treats an empty answer as no record and a garbled one as bad', async function () {
      const lookup = (answer) =>
        new Ens({
          network: '1',
          provider: fakeProvider(
            chain({
              resolverName: 'cb.id',
              wildcard: true,
              resolve: () => answer,
            }),
          ).provider,
        }).lookup('alice.cb.id');
      await assert.rejects(lookup(abi(['bytes'], ['0x'])), {
        code: 'notFound',
      });
      await assert.rejects(lookup('0x1234'), { code: 'badRecord' });
    });
  });

  describe('offchain lookups (EIP-3668)', function () {
    const response = abi(['bytes'], [abi(['address'], [ACCOUNT])]);

    function offchainChain({ sender } = {}) {
      return chain({
        resolverName: 'cb.id',
        wildcard: true,
        resolve: () => {
          throw revertError(offchainLookup({ sender }));
        },
        records: {
          [CALLBACK]: (data) => {
            const [answer, extraData] = args(['bytes', 'bytes'], data);
            assert.equal(extraData, '0x1234');
            // resolveWithProof returns what resolve() would have.
            return answer;
          },
        },
      });
    }

    it('follows the resolver to its gateway and back', async function () {
      const fetchOffchainData = sinon.stub().resolves(response);
      const { provider, calls } = fakeProvider(offchainChain());
      const address = await new Ens({
        network: '1',
        provider,
        fetchOffchainData,
      }).lookup('alice.cb.id', { allowOffchain: true });
      assert.equal(address, ACCOUNT);
      assert.deepEqual(fetchOffchainData.firstCall.args[0], {
        urls: ['https://gateway.example/{sender}/{data}.json'],
        sender: RESOLVER,
        callData: '0xdeadbeef',
      });
      const callback = calls.at(-1);
      assert.equal(callback.to, RESOLVER);
      assert.deepEqual(args(['bytes', 'bytes'], callback.data), [
        response,
        '0x1234',
      ]);
    });

    it('fails when no gateway answers', async function () {
      const fetchOffchainData = sinon.stub().rejects(
        Object.assign(new Error('no gateway answered'), {
          code: 'offchainLookupFailed',
        }),
      );
      const { provider } = fakeProvider(offchainChain());
      await assert.rejects(
        new Ens({ network: '1', provider, fetchOffchainData }).lookup(
          'alice.cb.id',
          { allowOffchain: true },
        ),
        { code: 'offchainLookupFailed' },
      );
    });

    it('contacts no gateway unless offchain lookups are allowed', async function () {
      const fetchOffchainData = sinon.stub().resolves(response);
      const { provider } = fakeProvider(offchainChain());
      await assert.rejects(
        new Ens({ network: '1', provider, fetchOffchainData }).lookup(
          'alice.cb.id',
        ),
        { code: 'offchainLookupFailed' },
      );
      assert.ok(fetchOffchainData.notCalled);
    });

    it('refuses a lookup sent on behalf of another contract', async function () {
      const fetchOffchainData = sinon.stub().resolves(response);
      const { provider } = fakeProvider(
        offchainChain({ sender: OTHER_CONTRACT }),
      );
      await assert.rejects(
        new Ens({ network: '1', provider, fetchOffchainData }).lookup(
          'alice.cb.id',
          { allowOffchain: true },
        ),
        { code: 'offchainLookupFailed' },
      );
      assert.ok(fetchOffchainData.notCalled);
    });

    it('stops a resolver that keeps sending the wallet offchain', async function () {
      const fetchOffchainData = sinon.stub().resolves(response);
      const { provider } = fakeProvider(
        chain({
          resolverName: 'cb.id',
          wildcard: true,
          resolve: () => {
            throw revertError(offchainLookup());
          },
          records: {
            [CALLBACK]: () => {
              throw revertError(offchainLookup());
            },
          },
        }),
      );
      await assert.rejects(
        new Ens({ network: '1', provider, fetchOffchainData }).lookup(
          'alice.cb.id',
          { allowOffchain: true },
        ),
        { code: 'offchainLookupFailed' },
      );
      assert.equal(fetchOffchainData.callCount, 4);
    });
  });

  it('looks up the name an address claims', async function () {
    const reverseNode = namehash(`${ACCOUNT.slice(2)}.addr.reverse`);
    const { provider, calls } = fakeProvider(
      chain({
        resolverName: `${ACCOUNT.slice(2)}.addr.reverse`,
        records: {
          [SELECTORS.name]: () => abi(['string'], ['vitalik.eth']),
        },
      }),
    );
    const name = await new Ens({ network: '1', provider }).reverse(ACCOUNT);
    assert.equal(name, 'vitalik.eth');
    assert.equal(calls.at(-1).data, `${SELECTORS.name}${reverseNode.slice(2)}`);
  });
});
