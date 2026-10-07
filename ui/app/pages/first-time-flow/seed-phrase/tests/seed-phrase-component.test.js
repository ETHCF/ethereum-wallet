import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import SeedPhrase from '../seed-phrase.component';

const SEED =
  'debris dizzy just program just float decrease vacant alarm reduce speak stadium';

function shallowRender(props = {}) {
  return shallow(
    <SeedPhrase requestSeedPhrase={sinon.stub().resolves(SEED)} {...props} />,
    { context: { t: (key) => key } },
  );
}

async function submit(root, password) {
  root
    .find('#seed-phrase-password')
    .simulate('change', { target: { value: password } });
  await root.find('form').prop('onSubmit')({ preventDefault: () => undefined });
  root.update();
}

describe('SeedPhrase Component', function () {
  it('shows a seed phrase it was given, without asking for the password', function () {
    const requestSeedPhrase = sinon.stub();
    const root = shallowRender({ seedPhrase: SEED, requestSeedPhrase });
    assert.equal(root.find('#seed-phrase-password').length, 0);
    assert.equal(root.find('Routes').length, 1);
    assert.equal(requestSeedPhrase.called, false);
  });

  it('asks for the password when the seed phrase is not in memory', async function () {
    const requestSeedPhrase = sinon.stub().resolves(SEED);
    const root = shallowRender({ requestSeedPhrase });
    assert.equal(root.find('Routes').length, 0);
    assert.equal(
      root.find('[data-testid="seed-phrase-password-submit"]').prop('disabled'),
      true,
    );

    await submit(root, 'correct horse battery staple');

    assert.deepEqual(requestSeedPhrase.firstCall.args, [
      'correct horse battery staple',
    ]);
    assert.equal(root.find('#seed-phrase-password').length, 0);
    assert.equal(root.find('Routes').length, 1);
    assert.equal(root.state('password'), '');
  });

  it('reports a wrong password and asks again', async function () {
    const requestSeedPhrase = sinon
      .stub()
      .rejects(new Error('Incorrect password'));
    const root = shallowRender({ requestSeedPhrase });

    await submit(root, 'wrong');

    assert.equal(
      root.find('#seed-phrase-password').prop('error'),
      'incorrectPassword',
    );
    assert.equal(root.find('Routes').length, 0);
  });
});
