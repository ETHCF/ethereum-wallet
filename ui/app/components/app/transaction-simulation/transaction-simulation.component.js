import classnames from 'classnames';
import PropTypes from 'prop-types';
import React, { useEffect, useState } from 'react';

import {
  SIMULATION_STALE_LOADING_MS,
  SIMULATION_STATUS,
  describeSimulation,
  isSimulationLoadingStale,
} from './transaction-simulation.util';
import { useI18nContext } from '../../../hooks/useI18nContext';

/**
 * Shows the estimated balance changes from simulating a transaction on the
 * network's RPC. It is display-only and never blocks confirming.
 *
 * @param {object} props - The component props.
 * @param {object} [props.simulation] - The txMeta's `simulation`.
 * @param {Array<object>} [props.trackedTokens] - The user's tracked tokens.
 * @param {string} [props.nativeCurrency] - The native currency's symbol.
 * @param {boolean} [props.stale] - Whether the user changed the transaction
 * in a way the preview does not reflect, such as a custom spending limit.
 * @returns {React.ReactElement|null} The preview.
 */
export default function TransactionSimulation({
  simulation,
  trackedTokens,
  nativeCurrency,
  stale,
}) {
  const t = useI18nContext();
  const loading = simulation?.status === SIMULATION_STATUS.LOADING;
  const [, setNow] = useState(0);

  // Re-render once a loading preview would count as interrupted.
  useEffect(() => {
    if (!loading) {
      return undefined;
    }
    const wait = Math.max(
      0,
      (simulation.startedAt || 0) + SIMULATION_STALE_LOADING_MS - Date.now(),
    );
    const timer = setTimeout(() => setNow(Date.now()), wait + 1);
    return () => clearTimeout(timer);
  }, [loading, simulation?.startedAt]);

  if (!simulation) {
    return null;
  }

  const note = (key) => (
    <div
      className="transaction-simulation transaction-simulation--muted"
      data-testid="transaction-simulation"
    >
      {t(key)}
    </div>
  );

  if (
    simulation.status === SIMULATION_STATUS.UNAVAILABLE ||
    isSimulationLoadingStale(simulation)
  ) {
    return note('simulationUnavailable');
  }
  if (loading) {
    return note('simulationLoading');
  }
  if (simulation.status === SIMULATION_STATUS.REVERTED) {
    return (
      <div
        className="transaction-simulation transaction-simulation--warning"
        data-testid="transaction-simulation"
        role="alert"
      >
        {t('simulationLikelyToFail', [
          simulation.revertReason || t('simulationUnknownReason'),
        ])}
        <div className="transaction-simulation__disclaimer">
          {t('simulationDisclaimer')}
        </div>
      </div>
    );
  }
  if (simulation.status !== SIMULATION_STATUS.SUCCESS) {
    return null;
  }

  const { changes, approvals } = describeSimulation(simulation, {
    t,
    trackedTokens,
    nativeCurrency,
  });

  return (
    <div
      className="transaction-simulation"
      data-testid="transaction-simulation"
    >
      <div className="transaction-simulation__title">
        {t('simulationTitle')}
      </div>
      {changes.length === 0 && approvals.length === 0 && (
        <div className="transaction-simulation__row">
          {t('simulationNoChanges')}
        </div>
      )}
      {changes.map(({ key, incoming, text }) => (
        <div
          key={key}
          className={classnames(
            'transaction-simulation__row',
            incoming
              ? 'transaction-simulation__row--in'
              : 'transaction-simulation__row--out',
          )}
        >
          {text}
        </div>
      ))}
      {approvals.map(({ key, text }) => (
        <div
          key={key}
          className="transaction-simulation__row transaction-simulation__row--approval"
        >
          {text}
        </div>
      ))}
      {stale && (
        <div className="transaction-simulation__disclaimer">
          {t('simulationStale')}
        </div>
      )}
      <div className="transaction-simulation__disclaimer">
        {t('simulationDisclaimer')}
      </div>
    </div>
  );
}

TransactionSimulation.propTypes = {
  simulation: PropTypes.shape({
    status: PropTypes.string,
    startedAt: PropTypes.number,
    revertReason: PropTypes.string,
    changes: PropTypes.array,
    approvals: PropTypes.array,
    tokens: PropTypes.object,
  }),
  trackedTokens: PropTypes.array,
  nativeCurrency: PropTypes.string,
  stale: PropTypes.bool,
};
