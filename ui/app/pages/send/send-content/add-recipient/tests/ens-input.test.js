import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import EnsInput from '../ens-input.component';

const ALICE = '0xa11ce00000000000000000000000000000000001';
const BOB = '0xb0b0000000000000000000000000000000000002';

function deferred() {
  let settle;
  const promise = new Promise((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: settle };
}

describe('EnsInput', function () {
  let clock;

  beforeEach(function () {
    clock = sinon.useFakeTimers();
  });

  afterEach(function () {
    clock.restore();
  });

  function render(props) {
    return shallow(
      <EnsInput
        network="1"
        onChange={() => undefined}
        onReset={() => undefined}
        updateEnsResolution={() => undefined}
        updateEnsResolutionError={() => undefined}
        {...props}
      />,
      { context: { t: (key) => key } },
    );
  }

  it('never shows an earlier name’s address for the name now entered', async function () {
    const updateEnsResolution = sinon.spy();
    const lookups = { 'alice.eth': deferred(), 'bob.eth': deferred() };
    const wrapper = render({
      updateEnsResolution,
      resolveEnsName: (name) => lookups[name].promise,
    });
    const type = (value) =>
      wrapper.find('input').prop('onChange')({ target: { value } });
    const settle = async () => {
      await clock.tickAsync(0);
    };

    type('alice.eth');
    await clock.tickAsync(250);
    type('bob.eth');
    // The field changed, so alice's pending result no longer applies.
    assert.equal(updateEnsResolution.lastCall.args[0], '');
    await clock.tickAsync(250);

    // Results arrive out of order: bob's first, then alice's.
    lookups['bob.eth'].resolve({ name: 'bob.eth', address: BOB });
    await settle();
    lookups['alice.eth'].resolve({ name: 'alice.eth', address: ALICE });
    await settle();

    assert.equal(updateEnsResolution.lastCall.args[0], BOB);
    assert(
      updateEnsResolution.args.every(([address]) => address !== ALICE),
      'alice’s address was never shown for bob.eth',
    );
  });

  it('looks up a name once typing pauses, not on every keystroke', async function () {
    const lookup = sinon.stub().resolves({ name: 'bob.eth', address: BOB });
    const wrapper = render({ resolveEnsName: lookup });
    for (const value of ['bob.e', 'bob.et', 'bob.eth']) {
      wrapper.find('input').prop('onChange')({ target: { value } });
      await clock.tickAsync(50);
    }
    await clock.tickAsync(250);
    assert.deepEqual(lookup.args, [['bob.eth']]);
  });

  it('shows why a name did not resolve', async function () {
    const cases = {
      'vitаlik.eth': ['invalidName', 'ensIllegalName'],
      'alice.cb.id': ['offchainLookupFailed', 'ensOffchainLookupFailed'],
      'nobody.eth': ['notFound', 'ensNotFoundOnCurrentNetwork'],
      'empty.eth': ['noAddress', 'noAddressForName'],
      'broken.eth': ['failed', 'ensLookupFailed'],
    };
    for (const [name, [error, message]] of Object.entries(cases)) {
      const updateEnsResolution = sinon.spy();
      const updateEnsResolutionError = sinon.spy();
      const wrapper = render({
        updateEnsResolution,
        updateEnsResolutionError,
        resolveEnsName: sinon.stub().resolves({ error }),
      });
      wrapper.find('input').prop('onChange')({ target: { value: name } });
      await clock.tickAsync(250);
      assert.equal(updateEnsResolutionError.lastCall.args[0], message, name);
      assert.ok(
        updateEnsResolution.args.every(([address]) => address === ''),
        name,
      );
    }
  });

  it('passes on the normalized name that was resolved', async function () {
    const updateEnsResolution = sinon.spy();
    const resolveEnsName = sinon
      .stub()
      .resolves({ name: 'paypai.eth', address: BOB });
    const wrapper = render({ updateEnsResolution, resolveEnsName });
    wrapper.find('input').prop('onChange')({ target: { value: 'paypaI.eth' } });
    await clock.tickAsync(250);
    await clock.tickAsync(0);
    assert.deepEqual(updateEnsResolution.lastCall.args, [BOB, 'paypai.eth']);
  });

  it('ignores an answer from before a network switch', async function () {
    const updateEnsResolution = sinon.spy();
    const first = deferred();
    const resolveEnsName = sinon.stub();
    resolveEnsName.onCall(0).returns(first.promise);
    resolveEnsName.onCall(1).resolves({ name: 'bob.eth', address: BOB });
    const wrapper = render({ updateEnsResolution, resolveEnsName });
    wrapper.find('input').prop('onChange')({ target: { value: 'bob.eth' } });
    await clock.tickAsync(250);
    wrapper.setProps({ network: '11155111' });
    await clock.tickAsync(250);
    first.resolve({ name: 'bob.eth', address: ALICE });
    await clock.tickAsync(0);
    assert.equal(resolveEnsName.callCount, 2);
    assert.equal(updateEnsResolution.lastCall.args[0], BOB);
    assert.ok(updateEnsResolution.args.every(([address]) => address !== ALICE));
  });
});
