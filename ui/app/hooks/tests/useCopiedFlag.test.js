import { act, renderHook } from '@testing-library/react';
import assert from 'assert';
import sinon from 'sinon';

import { useCopiedFlag } from '../useCopiedFlag';

describe('useCopiedFlag', function () {
  let clock;

  beforeEach(function () {
    clock = sinon.useFakeTimers();
  });

  afterEach(function () {
    clock.restore();
  });

  it('sets the flag until the timeout passes', function () {
    const { result } = renderHook(() => useCopiedFlag(3000));
    assert.equal(result.current[0], false);

    act(() => result.current[1]());
    assert.equal(result.current[0], true);

    act(() => clock.tick(2999));
    assert.equal(result.current[0], true);
    act(() => clock.tick(1));
    assert.equal(result.current[0], false);
  });

  it('holds the marked value and restarts the timer on each mark', function () {
    const { result } = renderHook(() => useCopiedFlag(1000));

    act(() => result.current[1]('ETH'));
    act(() => clock.tick(800));
    act(() => result.current[1]('XMR'));
    assert.equal(result.current[0], 'XMR');

    act(() => clock.tick(800));
    assert.equal(result.current[0], 'XMR');
    act(() => clock.tick(200));
    assert.equal(result.current[0], false);
  });

  it('clears its timer on unmount', function () {
    const { result, unmount } = renderHook(() => useCopiedFlag(1000));

    act(() => result.current[1]());
    unmount();
    assert.equal(clock.countTimers(), 0);
  });
});
