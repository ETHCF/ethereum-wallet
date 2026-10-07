import copyToClipboard from 'copy-to-clipboard';
import log from 'loglevel';
import { useCallback, useState } from 'react';
import { useDispatch } from 'react-redux';

import { clearClipboard, scheduleClipboardClear } from '../store/actions';

/**
 * Copies a secret and has the background clear the clipboard a minute later,
 * even if this page has closed by then.
 *
 * @returns {[string, Function, Function]} The state ('idle', 'copied', 'cleared'
 * or 'error'), a function that copies text, and one that clears the clipboard now.
 */
export function useSensitiveClipboard() {
  const dispatch = useDispatch();
  const [state, setState] = useState('idle');

  const copy = useCallback(
    async (text) => {
      copyToClipboard(text);
      setState('copied');
      try {
        // Promise no clear that this browser cannot do.
        if (!(await dispatch(scheduleClipboardClear()))) {
          setState('error');
        }
      } catch (error) {
        log.error(error);
        setState('error');
      }
    },
    [dispatch],
  );

  const clear = useCallback(async () => {
    try {
      setState((await dispatch(clearClipboard())) ? 'cleared' : 'error');
    } catch (error) {
      log.error(error);
      setState('error');
    }
  }, [dispatch]);

  return [state, copy, clear];
}
