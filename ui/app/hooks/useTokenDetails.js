import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import { useI18nContext } from './useI18nContext';
import { getTokens } from '../ducks/ecf-wallet/ecf-wallet';
import {
  fetchTokenDetails,
  resolveTokenDetails,
} from '../helpers/utils/token-util';

/**
 * Gets the symbol and decimals to show a token's amounts with. A tracked
 * token's details are used as they are; otherwise they are read from the
 * contract through the wallet's provider. If that fails the token is unknown:
 * amounts are in raw units (0 decimals) and the symbol says so.
 *
 * @param {string} [tokenAddress] - The token contract address.
 * @returns {{symbol: string, decimals: number, known: boolean, loading: boolean}}
 * The details, with `loading` true while they are being read.
 */
export function useTokenDetails(tokenAddress) {
  const t = useI18nContext();
  const tokens = useSelector(getTokens);
  const provider = useSelector((state) => state.ecfWallet.provider);
  // A contract address alone does not identify metadata. Including the RPC
  // also invalidates reads when its endpoint changes on the same chain.
  const networkKey = JSON.stringify([
    provider?.type,
    provider?.chainId,
    provider?.rpcTarget,
  ]);
  const address = tokenAddress?.toLowerCase();
  const trackedToken = address
    ? tokens?.find((token) => token.address?.toLowerCase() === address)
    : undefined;
  const tracked = resolveTokenDetails({ trackedToken }).known;
  const [fetched, setFetched] = useState({});

  useEffect(() => {
    if (!address || tracked) {
      return undefined;
    }
    let cancelled = false;
    const store = (details) => {
      if (!cancelled) {
        setFetched({ address, networkKey, details });
      }
    };
    fetchTokenDetails(address)
      .then(store)
      .catch(() => store({}));
    return () => {
      cancelled = true;
    };
  }, [address, tracked, networkKey]);

  const hasFetched =
    fetched.address === address && fetched.networkKey === networkKey;
  const loading = Boolean(address) && !tracked && !hasFetched;
  const details = resolveTokenDetails({
    trackedToken,
    fetched: hasFetched ? fetched.details : undefined,
  });
  let symbol = details.symbol || t('unknownToken');
  if (!details.known) {
    symbol = loading ? '' : t('unknownTokenRawUnits');
  }
  return { ...details, symbol, loading };
}
