import PropTypes from 'prop-types';
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { getNetworkDisplayName } from '../../../helpers/utils/network-display';
import { useI18nContext } from '../../../hooks/useI18nContext';
import { showNetworkDropdown } from '../../../store/actions';
import Button from '../../ui/button';

// Switching to a reachable network takes moments, so the banner waits this
// long before saying the network cannot be reached.
export const SHOW_AFTER_MS = 5000;

/**
 * Says when the selected network cannot be reached. It sits above the page
 * rather than over it: the wallet stays usable while the background keeps
 * trying, and only what needs the network waits for it.
 *
 * @param {object} props - Component props.
 * @param {number} [props.showAfterMs] - How long the network must be
 * unreachable before the banner shows.
 * @returns {React.ReactElement|null} The banner, or nothing.
 */
export default function NetworkConnectionBanner({
  showAfterMs = SHOW_AFTER_MS,
}) {
  const t = useI18nContext();
  const dispatch = useDispatch();
  const network = useSelector((state) => state.ecfWallet.network);
  const provider = useSelector((state) => state.ecfWallet.provider);
  // Which outage the banner is timing: each network, and each time it goes
  // down, waits afresh.
  const outage =
    network === 'loading'
      ? [provider?.type, provider?.rpcTarget, provider?.chainId].join('|')
      : null;
  const [timedOutage, setTimedOutage] = useState(outage);
  const [shownFor, setShownFor] = useState(null);
  if (outage !== timedOutage) {
    setTimedOutage(outage);
    setShownFor(null);
  }

  useEffect(() => {
    if (outage === null) {
      return undefined;
    }
    const timer = setTimeout(() => setShownFor(outage), showAfterMs);
    return () => clearTimeout(timer);
  }, [outage, showAfterMs]);

  if (outage === null || shownFor !== outage) {
    return null;
  }

  return (
    <div className="network-connection-banner" role="status">
      <span className="network-connection-banner__message">
        {t('networkUnreachable', [getNetworkDisplayName(provider, t)])}
      </span>
      <Button
        type="secondary"
        className="network-connection-banner__button"
        onClick={(event) => {
          // The network dropdown closes on clicks outside it.
          event.stopPropagation();
          dispatch(showNetworkDropdown());
        }}
      >
        {t('switchNetworks')}
      </Button>
    </div>
  );
}

NetworkConnectionBanner.propTypes = {
  showAfterMs: PropTypes.number,
};
