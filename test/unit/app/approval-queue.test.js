import { strict as assert } from 'assert';
import sinon from 'sinon';

import ApprovalQueue from '../../../app/scripts/lib/approval-queue';

describe('ApprovalQueue', function () {
  let queue;
  let onChange;

  beforeEach(function () {
    onChange = sinon.spy();
    queue = new ApprovalQueue({ label: 'test request', onChange });
  });

  it('lists pending requests oldest first, and reports each change', function () {
    queue.add({ id: 'a', origin: 'https://one.test' }).catch(() => undefined);
    queue.add({ id: 'b', origin: 'https://two.test' }).catch(() => undefined);
    assert.deepEqual(
      queue.requests().map(({ id }) => id),
      ['a', 'b'],
    );
    assert.equal(queue.size, 2);
    assert.equal(onChange.callCount, 2);
  });

  it('allows one pending request per site', async function () {
    queue.add({ id: 'a', origin: 'https://one.test' }).catch(() => undefined);
    assert.throws(() => queue.add({ id: 'b', origin: 'https://one.test' }), {
      code: -32002,
      message:
        'A test request from https://one.test is already pending. Please wait.',
    });
    assert.equal(queue.size, 1);
  });

  it("answers the site with the approved action's result", async function () {
    const result = queue.add({ id: 'a', origin: 'https://one.test' }, { x: 1 });
    const perform = sinon.stub().resolves('done');
    await queue.approve('a', perform);
    assert.equal(await result, 'done');
    assert.deepEqual(perform.firstCall.args, [
      { request: { id: 'a', origin: 'https://one.test' }, data: { x: 1 } },
    ]);
    assert.equal(queue.size, 0);
  });

  it('answers the site with the error when the approved action fails', async function () {
    const result = queue.add({ id: 'a', origin: 'https://one.test' });
    const failure = new Error('failed');
    await assert.rejects(
      queue.approve('a', () => Promise.reject(failure)),
      failure,
    );
    await assert.rejects(result, failure);
    assert.equal(queue.size, 0);
  });

  it('refuses one or every request with a user-rejected error', async function () {
    const one = queue.add({ id: 'a', origin: 'https://one.test' });
    const two = queue.add({ id: 'b', origin: 'https://two.test' });
    const three = queue.add({ id: 'c', origin: 'https://three.test' });
    queue.reject('a');
    await assert.rejects(one, { code: 4001 });
    queue.rejectAll();
    await assert.rejects(two, { code: 4001 });
    await assert.rejects(three, { code: 4001 });
    assert.equal(queue.size, 0);
  });

  it('refuses to answer a request twice', async function () {
    queue.add({ id: 'a', origin: 'https://one.test' }).catch(() => undefined);
    queue.reject('a');
    assert.throws(() => queue.reject('a'), {
      message: 'Test request "a" not found.',
    });
    await assert.rejects(
      queue.approve('a', () => true),
      {
        message: 'Test request "a" not found.',
      },
    );
  });
});
