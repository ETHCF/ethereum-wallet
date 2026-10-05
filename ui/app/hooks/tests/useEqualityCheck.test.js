import { renderHook } from '@testing-library/react';
import assert from 'assert';

import { useEqualityCheck } from '../useEqualityCheck';

describe('useEqualityCheck', function () {
  it('keeps the earlier value while a new one is equal to it', function () {
    const first = [{ address: '0x1' }];
    const { result, rerender } = renderHook(
      ({ value }) => useEqualityCheck(value),
      { initialProps: { value: first } },
    );
    rerender({ value: [{ address: '0x1' }] });
    assert.equal(result.current, first);
  });

  it('returns a new value once it differs', function () {
    const { result, rerender } = renderHook(
      ({ value }) => useEqualityCheck(value),
      { initialProps: { value: [{ address: '0x1' }] } },
    );
    const second = [{ address: '0x2' }];
    rerender({ value: second });
    assert.equal(result.current, second);
  });
});
