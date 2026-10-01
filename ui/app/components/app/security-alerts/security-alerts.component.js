import React from 'react'
import PropTypes from 'prop-types'
import classnames from 'classnames'
import { useI18nContext } from '../../../hooks/useI18nContext'

export function hasDangerAlerts (alerts = []) {
  return alerts.some(({ severity }) => severity === 'danger')
}

/**
 * Shows the on-device checks for a confirmation. Danger alerts must be
 * acknowledged before the parent enables its confirm button.
 */
export default function SecurityAlerts ({ alerts = [], acknowledged, onAcknowledge }) {
  const t = useI18nContext()
  if (!alerts.length) {
    return null
  }
  return (
    <div className="security-alerts" data-testid="security-alerts">
      {alerts.map(({ id, severity, args = [] }) => (
        <div
          key={`${id}-${args.join()}`}
          className={classnames('security-alerts__alert', `security-alerts__alert--${severity}`)}
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
  )
}

SecurityAlerts.propTypes = {
  alerts: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    severity: PropTypes.oneOf(['danger', 'warning', 'info']).isRequired,
    args: PropTypes.array,
  })),
  acknowledged: PropTypes.bool,
  onAcknowledge: PropTypes.func,
}
