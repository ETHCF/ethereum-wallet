import classnames from 'classnames';
import PropTypes from 'prop-types';
import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { CONFIRM_TRANSACTION_ROUTE } from '../../../helpers/constants/routes';
import {
  TRANSACTION_CATEGORY_SIGNATURE_REQUEST,
  UNAPPROVED_STATUS,
  TRANSACTION_CATEGORY_APPROVAL,
  FAILED_STATUS,
  DROPPED_STATUS,
  REJECTED_STATUS,
} from '../../../helpers/constants/transactions';
import { useCancelTransaction } from '../../../hooks/useCancelTransaction';
import { useI18nContext } from '../../../hooks/useI18nContext';
import { useRetryTransaction } from '../../../hooks/useRetryTransaction';
import { useShouldShowSpeedUp } from '../../../hooks/useShouldShowSpeedUp';
import { useTransactionDisplayData } from '../../../hooks/useTransactionDisplayData';
import Button from '../../ui/button';
import Preloader from '../../ui/icon/preloader';
import IconWithLabel from '../../ui/icon-with-label';
import ListItem from '../../ui/list-item';
import Tooltip from '../../ui/tooltip';
import TransactionIcon from '../transaction-icon';
import TransactionListItemDetails from '../transaction-list-item-details';
import TransactionStatus from '../transaction-status/transaction-status.component';

export default function TransactionListItem({
  transactionGroup,
  isEarliestNonce = false,
}) {
  const t = useI18nContext();
  const navigate = useNavigate();
  const { hasCancelled } = transactionGroup;
  const [showDetails, setShowDetails] = useState(false);

  const {
    initialTransaction: { id },
    primaryTransaction: { err },
  } = transactionGroup;
  const [cancelEnabled, cancelTransaction] =
    useCancelTransaction(transactionGroup);
  const retryTransaction = useRetryTransaction(transactionGroup);
  const shouldShowSpeedUp = useShouldShowSpeedUp(
    transactionGroup,
    isEarliestNonce,
  );

  const {
    title,
    subtitle,
    subtitleContainsOrigin,
    date,
    category,
    primaryCurrency,
    recipientAddress,
    status,
    isPending,
    senderAddress,
  } = useTransactionDisplayData(transactionGroup);

  const isSignatureReq = category === TRANSACTION_CATEGORY_SIGNATURE_REQUEST;
  const isApproval = category === TRANSACTION_CATEGORY_APPROVAL;
  const isUnapproved = status === UNAPPROVED_STATUS;

  const className = classnames('transaction-list-item', {
    'transaction-list-item--unconfirmed':
      isPending ||
      [FAILED_STATUS, DROPPED_STATUS, REJECTED_STATUS].includes(status),
  });

  const toggleShowDetails = useCallback(() => {
    if (isUnapproved) {
      navigate(`${CONFIRM_TRANSACTION_ROUTE}/${id}`);
      return;
    }
    setShowDetails((prev) => !prev);
  }, [isUnapproved, navigate, id]);

  const cancelButton = useMemo(() => {
    const btn = (
      <Button
        onClick={cancelTransaction}
        rounded
        className="transaction-list-item__header-button"
        disabled={!cancelEnabled}
      >
        {t('cancel')}
      </Button>
    );
    if (hasCancelled || !isPending || isUnapproved) {
      return null;
    }

    return cancelEnabled ? (
      btn
    ) : (
      <Tooltip title={t('notEnoughGas')} position="bottom">
        <div>{btn}</div>
      </Tooltip>
    );
  }, [
    isPending,
    t,
    isUnapproved,
    cancelEnabled,
    cancelTransaction,
    hasCancelled,
  ]);

  const speedUpButton = useMemo(() => {
    if (!shouldShowSpeedUp || !isPending || isUnapproved) {
      return null;
    }
    return (
      <Button
        type="secondary"
        rounded
        onClick={retryTransaction}
        className="transaction-list-item-details__header-button"
      >
        {t('speedUp')}
      </Button>
    );
  }, [shouldShowSpeedUp, isUnapproved, t, isPending, retryTransaction]);

  return (
    <>
      <ListItem
        onClick={toggleShowDetails}
        className={className}
        title={title}
        titleIcon={
          !isUnapproved &&
          isPending &&
          isEarliestNonce && (
            <IconWithLabel
              icon={<Preloader size={16} color="currentColor" />}
            />
          )
        }
        icon={<TransactionIcon category={category} status={status} />}
        subtitle={
          <h3>
            <TransactionStatus
              isPending={isPending}
              isEarliestNonce={isEarliestNonce}
              error={err}
              date={date}
              status={status}
            />
            <span
              className={
                subtitleContainsOrigin
                  ? 'transaction-list-item__origin'
                  : 'transaction-list-item__address'
              }
              title={subtitle}
            >
              {subtitle}
            </span>
          </h3>
        }
        rightContent={
          !isSignatureReq &&
          !isApproval && (
            <h2 className="transaction-list-item__primary-currency">
              {primaryCurrency}
            </h2>
          )
        }
      >
        <div className="transaction-list-item__pending-actions">
          {speedUpButton}
          {cancelButton}
        </div>
      </ListItem>
      {showDetails && (
        <TransactionListItemDetails
          title={title}
          onClose={toggleShowDetails}
          transactionGroup={transactionGroup}
          senderAddress={senderAddress}
          recipientAddress={recipientAddress}
          onRetry={retryTransaction}
          showRetry={status === FAILED_STATUS}
          showSpeedUp={shouldShowSpeedUp}
          isEarliestNonce={isEarliestNonce}
          onCancel={cancelTransaction}
          showCancel={isPending && !hasCancelled}
          cancelDisabled={!cancelEnabled}
        />
      )}
    </>
  );
}

TransactionListItem.propTypes = {
  transactionGroup: PropTypes.object.isRequired,
  isEarliestNonce: PropTypes.bool,
};
