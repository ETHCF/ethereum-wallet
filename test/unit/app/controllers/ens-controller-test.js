import assert from 'assert';
import sinon from 'sinon';

import EnsController from '../../../../app/scripts/controllers/ens';
import { toChecksumHexAddress } from '../../../../app/scripts/lib/checksum-address';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_X_ERROR_ADDRESS = '0x';

describe('EnsController', function () {
  describe('#reverseResolveName', function () {
    it('should resolve to an ENS name', async function () {
      const address = '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5';
      const networkStore = {
        subscribe: sinon.spy(),
      };
      const ens = new EnsController({
        ens: {
          reverse: sinon.stub().withArgs(address).returns('peaksignal.eth'),
          lookup: sinon.stub().withArgs('peaksignal.eth').returns(address),
        },
        networkStore,
      });

      const name = await ens.reverseResolveAddress(address);
      assert.equal(name, 'peaksignal.eth');
    });

    it('should only resolve an ENS name once', async function () {
      const address = '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5';
      const reverse = sinon.stub().withArgs(address).returns('peaksignal.eth');
      const lookup = sinon.stub().withArgs('peaksignal.eth').returns(address);
      const networkStore = {
        subscribe: sinon.spy(),
      };
      const ens = new EnsController({
        ens: {
          reverse,
          lookup,
        },
        networkStore,
      });

      assert.equal(await ens.reverseResolveAddress(address), 'peaksignal.eth');
      assert.equal(await ens.reverseResolveAddress(address), 'peaksignal.eth');
      assert.ok(lookup.calledOnce);
      assert.ok(reverse.calledOnce);
    });

    it('should fail if the name is registered to a different address than the reverse-resolved', async function () {
      const address = '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5';
      const networkStore = {
        subscribe: sinon.spy(),
      };
      const ens = new EnsController({
        ens: {
          reverse: sinon.stub().withArgs(address).returns('peaksignal.eth'),
          lookup: sinon.stub().withArgs('peaksignal.eth').returns('0xfoo'),
        },
        networkStore,
      });

      const name = await ens.reverseResolveAddress(address);
      assert.strictEqual(name, undefined);
    });

    it('gives no name when the lookup resolves to the zero address', async function () {
      const address = '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5';
      const networkStore = {
        subscribe: sinon.spy(),
      };
      const ens = new EnsController({
        ens: {
          reverse: sinon.stub().withArgs(address).returns('peaksignal.eth'),
          lookup: sinon.stub().withArgs('peaksignal.eth').returns(ZERO_ADDRESS),
        },
        networkStore,
      });

      assert.strictEqual(await ens.reverseResolveAddress(address), undefined);
      // Nothing is recorded for the UI to show next to the address.
      assert.deepEqual(ens.store.getState().ensResolutionsByAddress, {});
    });

    it('gives no name when the lookup resolves to the zero x address', async function () {
      const address = '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5';
      const networkStore = {
        subscribe: sinon.spy(),
      };
      const ens = new EnsController({
        ens: {
          reverse: sinon.stub().withArgs(address).returns('peaksignal.eth'),
          lookup: sinon
            .stub()
            .withArgs('peaksignal.eth')
            .returns(ZERO_X_ERROR_ADDRESS),
        },
        networkStore,
      });

      assert.strictEqual(await ens.reverseResolveAddress(address), undefined);
      // Nothing is recorded for the UI to show next to the address.
      assert.deepEqual(ens.store.getState().ensResolutionsByAddress, {});
    });

    it('gives the same normalized name on the first lookup and from the cache', async function () {
      const address = '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5';
      const ens = new EnsController({
        ens: {
          reverse: sinon.stub().returns('💩.eth'),
          lookup: sinon.stub().withArgs('💩.eth').returns(address),
        },
        networkStore: { subscribe: sinon.spy() },
      });

      assert.equal(await ens.reverseResolveAddress(address), '💩.eth');
      assert.equal(await ens.reverseResolveAddress(address), '💩.eth');
      assert.equal(
        ens.store.getState().ensResolutionsByAddress[
          toChecksumHexAddress(address)
        ],
        '💩.eth',
      );
    });

    it('gives no name for a reverse record that is not normalized or not safe to show', async function () {
      const address = '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5';
      for (const claimed of [
        'PeakSignal.eth',
        // Latin with one Cyrillic letter.
        'peаksignal.eth',
        'peak\u202esignal.eth',
        'peak\u200bsignal.eth',
        '',
      ]) {
        const lookup = sinon.stub().returns(address);
        const ens = new EnsController({
          ens: { reverse: sinon.stub().returns(claimed), lookup },
          networkStore: { subscribe: sinon.spy() },
        });
        assert.strictEqual(
          await ens.reverseResolveAddress(address),
          undefined,
          JSON.stringify(claimed),
        );
        assert.ok(lookup.notCalled);
        assert.deepEqual(ens.store.getState().ensResolutionsByAddress, {});
      }
    });

    it('gives no name when the name resolves to a different address', async function () {
      const address = '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5';
      const ens = new EnsController({
        ens: {
          reverse: sinon.stub().returns('peaksignal.eth'),
          lookup: sinon
            .stub()
            .withArgs('peaksignal.eth')
            .returns('0xd8da6bf26964af9d7eed9e10e5d4524c2be3c3c4'),
        },
        networkStore: { subscribe: sinon.spy() },
      });

      assert.strictEqual(await ens.reverseResolveAddress(address), undefined);
      assert.deepEqual(ens.store.getState().ensResolutionsByAddress, {});
    });

    it('verifies the reverse record without offchain lookups', async function () {
      const address = '0x8e5d75d60224ea0c33d0041e75de68b1c3cb6dd5';
      const lookup = sinon.stub().returns(address);
      const ens = new EnsController({
        ens: { reverse: sinon.stub().returns('peaksignal.eth'), lookup },
        networkStore: { subscribe: sinon.spy() },
      });

      await ens.reverseResolveAddress(address);
      assert.deepEqual(lookup.firstCall.args, ['peaksignal.eth']);
    });
  });

  describe('#resolveName', function () {
    const address = '0xd8da6bf26964af9d7eed9e10e5d4524c2be3c3c4';

    function controller(lookup) {
      return new EnsController({
        ens: { lookup, reverse: sinon.stub() },
        networkStore: { subscribe: sinon.spy() },
      });
    }

    it('resolves the normalized name, allowing offchain lookups', async function () {
      const lookup = sinon.stub().resolves(address);
      assert.deepEqual(await controller(lookup).resolveName('Alice.CB.id'), {
        name: 'alice.cb.id',
        address: toChecksumHexAddress(address),
      });
      assert.deepEqual(lookup.firstCall.args, [
        'alice.cb.id',
        { allowOffchain: true },
      ]);
    });

    it('refuses a name with confusable or invalid characters', async function () {
      const lookup = sinon.stub().resolves(address);
      for (const name of ['vitаlik.eth', 'a..eth', 'xn--abc.eth']) {
        assert.deepEqual(await controller(lookup).resolveName(name), {
          error: 'invalidName',
        });
      }
      assert.ok(lookup.notCalled);
    });

    it('reports why a name did not resolve', async function () {
      const failing = (code) =>
        sinon.stub().rejects(Object.assign(new Error(code), { code }));
      assert.deepEqual(
        await controller(failing('notFound')).resolveName('nobody.eth'),
        { error: 'notFound' },
      );
      assert.deepEqual(
        await controller(failing('offchainLookupFailed')).resolveName(
          'alice.cb.id',
        ),
        { error: 'offchainLookupFailed' },
      );
      assert.deepEqual(
        await controller(
          sinon.stub().rejects(new Error('timeout')),
        ).resolveName('alice.eth'),
        { error: 'failed' },
      );
      assert.deepEqual(
        await controller(sinon.stub().resolves(ZERO_ADDRESS)).resolveName(
          'alice.eth',
        ),
        { error: 'noAddress' },
      );
    });

    it('does not resolve on a network without ENS', async function () {
      const ens = new EnsController({
        networkStore: { getState: () => '137', subscribe: sinon.spy() },
      });
      assert.deepEqual(await ens.resolveName('alice.eth'), {
        error: 'unsupported',
      });
    });

    it('drops an answer from a network the wallet has left', async function () {
      let switchNetwork;
      let finish;
      const ens = new EnsController({
        ens: {
          lookup: () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        },
        networkStore: {
          subscribe: (listener) => {
            switchNetwork = listener;
          },
        },
      });
      const result = ens.resolveName('alice.eth');
      switchNetwork('137');
      finish(address);
      assert.deepEqual(await result, { error: 'networkChanged' });
    });
  });
});
