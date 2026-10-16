import { BigNumber } from 'bignumber.js';

import { SIMULATION_STATUS } from '../../../../../app/scripts/lib/transaction-simulation';
import { checksumAddress } from '../../../helpers/utils/util';

export { SIMULATION_STATUS };

// A preview still loading after this was interrupted (the background times
// the request out well before), so it is shown as unavailable.
export const SIMULATION_STALE_LOADING_MS = 15000;

// Allowances at or above 2^128 base units are unlimited in effect, as the
// approval screen and the background's security checks also treat them.
const UNLIMITED_BASE_UNITS = new BigNumber(2).pow(128);

const NATIVE_DECIMALS = 18;

/**
 * Shortens an address for a label, such as 0x1234…abcd.
 *
 * @param {string} address - The address.
 * @returns {string} The shortened, checksummed address.
 */
export function shortAddress(address) {
  const checksummed = checksumAddress(address);
  return `${checksummed.slice(0, 6)}…${checksummed.slice(-4)}`;
}

/**
 * Formats an amount in base units as a whole-token amount, exactly.
 *
 * @param {string} baseUnits - The amount, as a decimal string.
 * @param {number} decimals - The token's decimals.
 * @returns {string} The amount, never in exponent form.
 */
export function formatUnits(baseUnits, decimals) {
  return new BigNumber(baseUnits).shiftedBy(-decimals).toFixed();
}

function findTrackedToken(trackedTokens, address) {
  return (trackedTokens || []).find(
    (token) => token.address?.toLowerCase() === address,
  );
}

/**
 * Picks the decimals and label for a token: the tracked token's details, or
 * else what the simulation read from the contract, with its address since
 * any contract can claim any symbol.
 *
 * @param {string} address - The token contract, lowercase.
 * @param {object} context - The details known about tokens.
 * @param {Array<object>} [context.trackedTokens] - The user's tracked tokens.
 * @param {object} [context.tokenMetadata] - The simulation's token details,
 * by lowercase address.
 * @returns {object} `{ decimals, label }`; decimals is undefined when unknown.
 */
function tokenDetails(address, { trackedTokens, tokenMetadata = {} }) {
  const tracked = findTrackedToken(trackedTokens, address);
  if (tracked?.symbol && tracked.decimals !== undefined) {
    return { decimals: Number(tracked.decimals), label: tracked.symbol };
  }
  const { symbol, decimals } = tokenMetadata[address] || {};
  return {
    decimals,
    label: symbol
      ? `${symbol} (${shortAddress(address)})`
      : shortAddress(address),
  };
}

function nftLabel(address, tokenId, context) {
  const { label } = tokenDetails(address, context);
  return `${label} #${tokenId}`;
}

/**
 * Describes a successful simulation's balance changes and approvals for
 * display.
 *
 * @param {object} simulation - The txMeta's `simulation`.
 * @param {object} options - Options.
 * @param {Function} options.t - Translates a locale key.
 * @param {Array<object>} [options.trackedTokens] - The user's tracked tokens.
 * @param {string} [options.nativeCurrency] - The native currency's symbol.
 * @returns {{ changes: object[], approvals: object[] }} The lines to show:
 * each change with `key`, `incoming` and `text`; each approval with `key` and
 * `text`.
 */
export function describeSimulation(
  simulation,
  { t, trackedTokens, nativeCurrency = 'ETH' },
) {
  const context = { trackedTokens, tokenMetadata: simulation.tokens };
  const changes = (simulation.changes || []).map((change, index) => {
    const amount = new BigNumber(change.amount);
    const incoming = amount.isPositive();
    const magnitude = amount.abs().toFixed();
    let text;
    if (change.standard === 'native') {
      text = `${formatUnits(magnitude, NATIVE_DECIMALS)} ${nativeCurrency}`;
    } else if (change.standard === 'erc20') {
      const { decimals, label } = tokenDetails(change.address, context);
      text =
        decimals === undefined
          ? t('simulationRawUnits', [magnitude, label])
          : `${formatUnits(magnitude, decimals)} ${label}`;
    } else if (change.standard === 'erc721') {
      text = nftLabel(change.address, change.tokenId, context);
    } else {
      text = `${magnitude} × ${nftLabel(change.address, change.tokenId, context)}`;
    }
    return {
      key: `${change.standard}-${change.address}-${change.tokenId}-${index}`,
      incoming,
      text: `${incoming ? '+' : '-'}${text}`,
    };
  });

  const approvals = (simulation.approvals || []).map((approval, index) => {
    const spender = checksumAddress(approval.spender);
    let text;
    if (approval.standard === 'erc20') {
      const { decimals, label } = tokenDetails(approval.address, context);
      let amount;
      if (new BigNumber(approval.amount).gte(UNLIMITED_BASE_UNITS)) {
        amount = `${t('unlimited')} ${label}`;
      } else if (decimals === undefined) {
        amount = t('simulationRawUnits', [approval.amount, label]);
      } else {
        amount = `${formatUnits(approval.amount, decimals)} ${label}`;
      }
      text = t('simulationApproveSpend', [spender, amount]);
    } else if (approval.standard === 'erc721') {
      text = t('simulationApproveNft', [
        spender,
        nftLabel(approval.address, approval.tokenId, context),
      ]);
    } else {
      const { label } = tokenDetails(approval.address, context);
      text = t(
        approval.approved ? 'simulationApproveAll' : 'simulationRevokeAll',
        [spender, label],
      );
    }
    return { key: `${approval.standard}-${index}`, text };
  });

  return { changes, approvals };
}

/**
 * Whether a loading preview has run long enough that it was interrupted.
 *
 * @param {object} [simulation] - The txMeta's `simulation`.
 * @param {number} [now] - The current time.
 * @returns {boolean} True if the preview should be shown as unavailable.
 */
export function isSimulationLoadingStale(simulation, now = Date.now()) {
  return (
    simulation?.status === SIMULATION_STATUS.LOADING &&
    now - (simulation.startedAt || 0) > SIMULATION_STALE_LOADING_MS
  );
}
