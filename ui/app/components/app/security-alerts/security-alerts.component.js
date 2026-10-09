import classnames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import { useI18nContext } from '../../../hooks/useI18nContext';

export function hasDangerAlerts(alerts = []) {
  return alerts.some(({ severity }) => severity === 'danger');
}

/**
 * Derives the danger-alert acknowledgement for a confirmation that keeps the
 * acknowledged flag in its own state (and resets it when the request changes).
 *
 * @param {Array<object>} [alerts] - The request's security alerts.
 * @param {boolean} acknowledged - Whether the alerts have been acknowledged.
 * @param {Function} onAcknowledge - Stores the new acknowledged flag.
 * @returns {{needsAcknowledgement: boolean, alertsProps: object}} Whether
 * confirming must wait for the acknowledgement, and the props for
 * SecurityAlerts.
 */
export function getAlertAcknowledgement(alerts, acknowledged, onAcknowledge) {
  return {
    needsAcknowledgement: hasDangerAlerts(alerts) && !acknowledged,
    alertsProps: { alerts, acknowledged, onAcknowledge },
  };
}

/**
 * Shows the on-device checks for a confirmation. Danger alerts must be
 * acknowledged before the parent enables its confirm button.
 *
 * @param {object} props - The component props.
 * @param {Array<object>} [props.alerts] - The alerts, each with an id (its
 * message key), a severity and optional message args.
 * @param {boolean} [props.acknowledged] - Whether the danger alerts have been
 * acknowledged.
 * @param {Function} [props.onAcknowledge] - Called with the new checked state
 * of the acknowledgement checkbox.
 * @returns {React.ReactElement|null} The alerts, or nothing if there are none.
 */
export default function SecurityAlerts({
  alerts = [],
  acknowledged,
  onAcknowledge,
}) {
  const t = useI18nContext();
  if (!alerts.length) {
    return null;
  }
  return (
    <div className="security-alerts" data-testid="security-alerts">
      {alerts.map(({ id, severity, args = [] }) => (
        <div
          key={`${id}-${args.join()}`}
          className={classnames(
            'security-alerts__alert',
            `security-alerts__alert--${severity}`,
          )}
          data-testid={`security-alert-${id}`}
        >
          {t(id, args)}
        </div>
      ))}
      {hasDangerAlerts(alerts) && (
        <label className="security-alerts__acknowledge">
          <input
            type="checkbox"
            data-testid="security-alerts-acknowledge"
            checked={Boolean(acknowledged)}
            onChange={(event) => onAcknowledge(event.target.checked)}
          />
          {t('securityAlertsAcknowledge')}
        </label>
      )}
    </div>
  );
}

SecurityAlerts.propTypes = {
  alerts: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      severity: PropTypes.oneOf(['danger', 'warning', 'info']).isRequired,
      args: PropTypes.array,
    }),
  ),
  acknowledged: PropTypes.bool,
  onAcknowledge: PropTypes.func,
};
