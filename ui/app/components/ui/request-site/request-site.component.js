import PropTypes from 'prop-types';
import React from 'react';

import { useI18nContext } from '../../../hooks/useI18nContext';

// Requests the wallet makes itself carry this origin.
const WALLET_ORIGIN = 'ecf-wallet';

/**
 * The address a request came from, as the browser reported it. A site names
 * and draws itself in its metadata however it likes, so screens that ask the
 * user to approve a request show this as well.
 *
 * @param {string} origin - The request's origin, such as https://example.com.
 * @returns {string} The host for an https origin, and otherwise the origin
 * itself, so that an insecure or non-web origin shows its scheme.
 */
export function displayOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' ? url.host : origin;
  } catch (_) {
    return origin;
  }
}

export default function RequestSite({ origin }) {
  const t = useI18nContext();
  if (!origin || origin === WALLET_ORIGIN) {
    return null;
  }
  return (
    <div className="request-site" data-testid="request-site">
      <span className="request-site__label">{`${t('origin')}:`}</span>
      <span className="request-site__value">{displayOrigin(origin)}</span>
    </div>
  );
}

RequestSite.propTypes = {
  origin: PropTypes.string,
};
