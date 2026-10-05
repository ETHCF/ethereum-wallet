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
    // Each test replaces the ENS client the component builds from it.
    global.ethereumProvider = { request: () => new Promise(() => undefined) };
  });

  afterEach(function () {
    clock.restore();
    delete global.ethereumProvider;
  });

  it('never shows an earlier name’s address for the name now entered', async function () {
    const updateEnsResolution = sinon.spy();
    const wrapper = shallow(
      <EnsInput
        network="1"
        onChange={() => undefined}
        onReset={() => undefined}
        updateEnsResolution={updateEnsResolution}
        updateEnsResolutionError={() => undefined}
      />,
      { context: { t: (key) => key } },
    );
    const lookups = { 'alice.eth': deferred(), 'bob.eth': deferred() };
    wrapper.instance().ens = { lookup: (name) => lookups[name].promise };
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
    lookups['bob.eth'].resolve(BOB);
    await settle();
    lookups['alice.eth'].resolve(ALICE);
    await settle();

    assert.equal(updateEnsResolution.lastCall.args[0], BOB);
    assert(
      updateEnsResolution.args.every(([address]) => address !== ALICE),
      'alice’s address was never shown for bob.eth',
    );
  });

  it('looks up a name once typing pauses, not on every keystroke', async function () {
    const lookup = sinon.stub().resolves(BOB);
    const wrapper = shallow(
      <EnsInput
        network="1"
        onChange={() => undefined}
        onReset={() => undefined}
        updateEnsResolution={() => undefined}
        updateEnsResolutionError={() => undefined}
      />,
      { context: { t: (key) => key } },
    );
    wrapper.instance().ens = { lookup };
    for (const value of ['bob.e', 'bob.et', 'bob.eth']) {
      wrapper.find('input').prop('onChange')({ target: { value } });
      await clock.tickAsync(50);
    }
    await clock.tickAsync(250);
    assert.deepEqual(lookup.args, [['bob.eth']]);
  });
});
