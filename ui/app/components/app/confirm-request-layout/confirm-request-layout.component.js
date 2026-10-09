import classnames from 'classnames';
import PropTypes from 'prop-types';
import React, { useCallback, useEffect, useRef } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { ENVIRONMENT_TYPE_NOTIFICATION } from '../../../../../app/scripts/lib/enums';
import { getEnvironmentType } from '../../../../../app/scripts/lib/util';
import { clearConfirmTransaction } from '../../../ducks/confirm-transaction/confirm-transaction.duck';
import { getMostRecentOverviewPage } from '../../../ducks/history/history';
import { conversionUtil } from '../../../helpers/utils/conversion-util';
import { useI18nContext } from '../../../hooks/useI18nContext';
import {
  getNativeCurrency,
  getTargetAccountWithSendEtherInfo,
} from '../../../selectors';
import Button from '../../ui/button';
import Identicon from '../../ui/identicon';
import AccountListItem from '../account-list-item';

/**
 * The frame shared by the confirmation screens for signature, decryption and
 * encryption-public-key requests: a titled header, the requesting account and
 * its balance, the page's own body, and a cancel/confirm footer.
 *
 * Either footer button removes the popup's close handler, waits for its action,
 * clears the pending confirmation and returns to the most recent overview
 * page. Closing the notification popup cancels the request.
 *
 * @param {object} props - The component props.
 * @param {string} props.title - The header text.
 * @param {string} props.fromAddress - The address of the account asked to act.
 * @param {Function} props.onCancel - Rejects the request; given the event.
 * @param {Function} props.onConfirm - Approves the request; given the event.
 * @param {string} props.confirmText - The confirm button's label.
 * @param {boolean} [props.confirmDisabled] - Whether confirming is blocked.
 * @param {string} [props.cancelButtonClassName] - An extra class for the cancel button.
 * @param {string} [props.confirmButtonTestId] - The confirm button's test id.
 * @param {React.ReactNode} props.children - The page's own body content.
 * @returns {React.ReactElement} The confirmation screen.
 */
export default function ConfirmRequestLayout({
  title,
  fromAddress,
  onCancel,
  onConfirm,
  confirmText,
  confirmDisabled = false,
  cancelButtonClassName,
  confirmButtonTestId,
  children,
}) {
  const t = useI18nContext();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const nativeCurrency = useSelector(getNativeCurrency);
  const mostRecentOverviewPage = useSelector(getMostRecentOverviewPage);
  const fromAccount = useSelector(
    (state) => getTargetAccountWithSendEtherInfo(state, fromAddress),
    shallowEqual,
  );

  // The unload handler is registered once, so it reads the latest onCancel.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  const handleBeforeUnload = useCallback(
    async (event) => {
      await onCancelRef.current(event);
      dispatch(clearConfirmTransaction());
    },
    [dispatch],
  );

  useEffect(() => {
    if (getEnvironmentType() !== ENVIRONMENT_TYPE_NOTIFICATION) {
      return undefined;
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);

  const resolveWith = (action) => async (event) => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    await action(event);
    dispatch(clearConfirmTransaction());
    navigate(mostRecentOverviewPage);
  };

  const balanceInEther = conversionUtil(fromAccount?.balance, {
    fromNumericBase: 'hex',
    toNumericBase: 'dec',
    fromDenomination: 'WEI',
    numberOfDecimals: 6,
  });

  return (
    <div className="confirm-request-layout">
      <div className="confirm-request-layout__header">
        <div className="confirm-request-layout__header-background" />
        <div className="confirm-request-layout__header__text">{title}</div>
        <div className="confirm-request-layout__header__tip-container">
          <div className="confirm-request-layout__header__tip" />
        </div>
      </div>

      <div className="confirm-request-layout__body">
        <div className="confirm-request-layout__account-info">
          <div className="confirm-request-layout__account">
            <div className="confirm-request-layout__account-text">
              {`${t('account')}:`}
            </div>
            <div className="confirm-request-layout__account-item">
              <AccountListItem account={fromAccount} />
            </div>
          </div>
          <div className="confirm-request-layout__request-icon">
            <Identicon diameter={40} />
          </div>
          <div className="confirm-request-layout__balance">
            <div className="confirm-request-layout__balance-text">
              {`${t('balance')}:`}
            </div>
            <div className="confirm-request-layout__balance-value">
              {`${balanceInEther} ${nativeCurrency}`}
            </div>
          </div>
        </div>
        {children}
      </div>

      <div className="confirm-request-layout__footer">
        <Button
          type="default"
          large
          className={classnames(
            'confirm-request-layout__footer__cancel-button',
            cancelButtonClassName,
          )}
          onClick={resolveWith(onCancel)}
        >
          {t('cancel')}
        </Button>
        <Button
          data-testid={confirmButtonTestId}
          disabled={confirmDisabled}
          type="secondary"
          large
          className="confirm-request-layout__footer__confirm-button"
          onClick={resolveWith(onConfirm)}
        >
          {confirmText}
        </Button>
      </div>
    </div>
  );
}

ConfirmRequestLayout.propTypes = {
  title: PropTypes.string.isRequired,
  fromAddress: PropTypes.string,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  confirmText: PropTypes.string.isRequired,
  confirmDisabled: PropTypes.bool,
  cancelButtonClassName: PropTypes.string,
  confirmButtonTestId: PropTypes.string,
  children: PropTypes.node,
};

/**
 * The requesting site's icon (or its initial) above a notice about the request.
 *
 * @param {object} props - The component props.
 * @param {object} props.origin - The site's metadata: its `name` and `icon`.
 * @param {React.ReactNode} props.children - The notice shown under the icon.
 * @returns {React.ReactElement} The site and notice.
 */
export function RequestOrigin({ origin, children }) {
  return (
    <div className="confirm-request-layout__origin">
      <section>
        {origin.icon ? (
          <img
            className="confirm-request-layout__origin-icon"
            src={origin.icon}
          />
        ) : (
          <i className="confirm-request-layout__origin-icon--default">
            {origin.name.charAt(0).toUpperCase()}
          </i>
        )}
        {children}
      </section>
    </div>
  );
}

RequestOrigin.propTypes = {
  origin: PropTypes.shape({
    name: PropTypes.string.isRequired,
    icon: PropTypes.string,
  }).isRequired,
  children: PropTypes.node,
};

/**
 * Maps the pending request and the sites' metadata to props, for the pages
 * built on this layout.
 *
 * @param {object} state - The Redux state.
 * @returns {{txData: object, domainMetadata: object}} The props.
 */
export function mapConfirmRequestStateToProps(state) {
  const {
    confirmTransaction: { txData = {} },
    ecfWallet: { domainMetadata = {} },
  } = state;
  return { txData, domainMetadata };
}
