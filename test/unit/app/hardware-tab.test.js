import { strict as assert } from 'assert';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

import { flush } from '../../lib/page-globals';

const backgroundUrl = 'chrome-extension://wallet/service-worker.js';

function loadHardwareTab(performRequest) {
  let listener;
  const runtime = {
    id: 'wallet',
    getURL: (path) => `chrome-extension://wallet/${path}`,
    onMessage: { addListener: (added) => (listener = added) },
  };
  proxyquire('../../../app/scripts/hardware', {
    './lib/extension-api': {
      __esModule: true,
      default: { runtime },
      '@noCallThru': true,
    },
    './lib/hardware-transport': {
      createHardwareRequestHandler: () => performRequest,
      '@noCallThru': true,
    },
  });
  return async (message, respond) => {
    const async = listener(
      { type: 'ecf-wallet-hardware-request', ...message },
      { id: 'wallet', url: backgroundUrl },
      respond,
    );
    await flush();
    return async;
  };
}

describe('Hardware connection tab', function () {
  it('responds with the result of a request', async function () {
    const send = loadHardwareTab(sinon.stub().resolves({ result: 1 }));
    const respond = sinon.spy();
    assert.equal(await send({}, respond), true);
    assert.deepEqual(respond.args, [[{ result: 1 }]]);
  });

  it('responds with the message of a failed request', async function () {
    const send = loadHardwareTab(sinon.stub().rejects(new Error('No device')));
    const respond = sinon.spy();
    await send({}, respond);
    assert.deepEqual(respond.args, [[{ error: 'No device' }]]);
  });

  it('responds when a request rejects with something other than an Error', async function () {
    const send = loadHardwareTab(sinon.stub().rejects({ message: 42 }));
    const respond = sinon.spy();
    await send({}, respond);
    assert.deepEqual(respond.args, [
      [{ error: 'Hardware wallet request failed. Please retry.' }],
    ]);
  });

  it('responds with an error when the result cannot be sent', async function () {
    const send = loadHardwareTab(sinon.stub().resolves({ result: 1 }));
    const respond = sinon.stub();
    respond.onFirstCall().throws(new Error('Could not serialize message'));
    await send({}, respond);
    assert.deepEqual(respond.secondCall.args, [
      { error: 'Could not serialize message' },
    ]);
  });

  it('ignores messages that are not hardware requests', function () {
    const send = loadHardwareTab(sinon.stub().resolves({}));
    return send({ type: 'other' }, sinon.spy()).then((async) =>
      assert.equal(async, false),
    );
  });
});
