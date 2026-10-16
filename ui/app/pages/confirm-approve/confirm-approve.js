import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';

import ConfirmApproveContent from './confirm-approve-content';
import {
  formatApprovalAmount,
  getCustomTxParamsData,
} from './confirm-approve.util';
import {
  calcTokenAmount,
  getTokenToAddress,
  getTokenValue,
} from '../../helpers/utils/token-util';
import { getTokenData } from '../../helpers/utils/transactions.util';
import { useI18nContext } from '../../hooks/useI18nContext';
import { useTokenDetails } from '../../hooks/useTokenDetails';
import { useTokenTracker } from '../../hooks/useTokenTracker';
import {
  transactionFeeSelector,
  txDataSelector,
} from '../../selectors/confirm-transaction';
import { getDomainMetadata } from '../../selectors/selectors';
import { getNativeCurrency } from '../../selectors/send';
import { currentNetworkTxListSelector } from '../../selectors/transactions';
import { showModal } from '../../store/actions';
import ConfirmTransactionBase from '../confirm-transaction-base';

export default function ConfirmApprove() {
  const t = useI18nContext();
  const dispatch = useDispatch();
  const { id: paramsTransactionId } = useParams();
  const { id: transactionId, txParams: { to: tokenAddress, data } = {} } =
    useSelector(txDataSelector);

  const nativeCurrency = useSelector(getNativeCurrency);
  const currentNetworkTxList = useSelector(currentNetworkTxListSelector);
  const domainMetadata = useSelector(getDomainMetadata);

  const transaction =
    currentNetworkTxList.find(
      ({ id }) => id === (Number(paramsTransactionId) || transactionId),
    ) || {};
  const { ethTransactionTotal } = useSelector((state) =>
    transactionFeeSelector(state, transaction),
  );

  const { tokensWithBalances } = useTokenTracker([{ address: tokenAddress }]);
  const tokenTrackerBalance = tokensWithBalances[0]?.balance || '';

  // An untracked token's details are read from its contract. If they cannot
  // be, amounts (including a custom spending limit) are in raw units.
  const { symbol: tokenSymbol, decimals } = useTokenDetails(tokenAddress);
  const tokenData = getTokenData(data);
  const tokenValue = tokenData && getTokenValue(tokenData.params);
  const toAddress = tokenData && getTokenToAddress(tokenData.params);
  const tokenAmount =
    tokenData && calcTokenAmount(tokenValue, decimals).toFixed();

  const [customPermissionAmount, setCustomPermissionAmount] = useState('');

  const previousTokenAmount = useRef(tokenAmount);

  useEffect(() => {
    if (customPermissionAmount && previousTokenAmount.current !== tokenAmount) {
      setCustomPermissionAmount(tokenAmount);
    }
    previousTokenAmount.current = tokenAmount;
  }, [customPermissionAmount, tokenAmount]);

  const { origin } = transaction;
  const formattedOrigin = origin
    ? origin[0].toUpperCase() + origin.slice(1)
    : '';
  const txData = transaction;

  const { icon: siteImage = '' } = domainMetadata[origin] || {};

  const tokensText = `${formatApprovalAmount(tokenAmount, decimals, t)} ${tokenSymbol}`;
  const tokenBalance = tokenTrackerBalance
    ? calcTokenAmount(tokenTrackerBalance, decimals).toFixed()
    : '';
  const customData = customPermissionAmount
    ? getCustomTxParamsData(data, { customPermissionAmount, decimals })
    : null;

  return (
    <ConfirmTransactionBase
      toAddress={toAddress}
      identiconAddress={tokenAddress}
      showAccountInHeader
      title={tokensText}
      contentComponent={
        <ConfirmApproveContent
          decimals={decimals}
          siteImage={siteImage}
          setCustomAmount={setCustomPermissionAmount}
          customTokenAmount={String(customPermissionAmount)}
          tokenAmount={tokenAmount}
          origin={formattedOrigin}
          tokenSymbol={tokenSymbol}
          tokenBalance={tokenBalance}
          showCustomizeGasModal={() =>
            dispatch(showModal({ name: 'CUSTOMIZE_GAS', txData }))
          }
          showEditApprovalPermissionModal={({
            customTokenAmount,
            decimals,
            origin,
            setCustomAmount,
            tokenAmount,
            tokenBalance,
            tokenSymbol,
          }) =>
            dispatch(
              showModal({
                name: 'EDIT_APPROVAL_PERMISSION',
                customTokenAmount,
                decimals,
                origin,
                setCustomAmount,
                tokenAmount,
                tokenBalance,
                tokenSymbol,
              }),
            )
          }
          data={customData || data}
          toAddress={toAddress}
          nativeCurrency={nativeCurrency}
          ethTransactionTotal={ethTransactionTotal}
        />
      }
      hideSenderToRecipient
      customTxParamsData={customData}
    />
  );
}
