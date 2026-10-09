import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks a short-lived "Copied!" flag after something is copied.
 *
 * @param {number} timeoutMs - How long the flag stays set.
 * @returns {[*, Function]} The flag (false when idle, otherwise the value last
 * marked, true by default) and a function that sets it and restarts the timer.
 * The timer is cleared on unmount.
 */
export function useCopiedFlag(timeoutMs) {
  const [copied, setCopied] = useState(false);
  const timer = useRef();

  useEffect(() => () => clearTimeout(timer.current), []);

  const markCopied = useCallback(
    (value = true) => {
      setCopied(value);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), timeoutMs);
    },
    [timeoutMs],
  );

  return [copied, markCopied];
}
