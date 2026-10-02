import React from 'react'
import PropTypes from 'prop-types'
import classnames from 'classnames'
import UserPreferencedCurrencyDisplay from '../../user-preferenced-currency-display'

const ConfirmDetailRow = (props) => {
  const {
    label,
    primaryText,
    onHeaderClick,
    primaryValueTextColor,
    headerText,
    headerTextClassName,
    value,
  } = props

  return (
    <div className="confirm-detail-row">
      <div className="confirm-detail-row__label">
        { label }
      </div>
      <div className="confirm-detail-row__details">
        {
          headerText && (
            <div
              className={classnames('confirm-detail-row__header-text', headerTextClassName)}
              onClick={() => onHeaderClick && onHeaderClick()}
            >
              { headerText }
            </div>
          )
        }
        {
          primaryText
            ? (
              <div
                className="confirm-detail-row__primary"
                style={{ color: primaryValueTextColor }}
              >
                { primaryText }
              </div>
            ) : (
              <UserPreferencedCurrencyDisplay
                className="confirm-detail-row__primary"
                value={value}
                showEthLogo
                ethLogoHeight="18"
                style={{ color: primaryValueTextColor }}
                hideLabel
              />
            )
        }
      </div>
    </div>
  )
}

ConfirmDetailRow.propTypes = {
  headerText: PropTypes.string,
  headerTextClassName: PropTypes.string,
  label: PropTypes.string,
  onHeaderClick: PropTypes.func,
  primaryValueTextColor: PropTypes.string,
  primaryText: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  value: PropTypes.string,
}

export default ConfirmDetailRow
