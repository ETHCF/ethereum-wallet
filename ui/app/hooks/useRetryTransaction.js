import { useCallback } from 'react';
import { useDispatch } from 'react-redux';

import {
  gasPriceForTransaction,
  isFeeMarketTransaction,
} from '../../../app/scripts/lib/transaction-fees';
import {
  fetchBasicGasEstimates,
  setCustomGasPriceForRetry,
  setCustomGasLimit,
} from '../ducks/gas/gas.duck';
import { increaseLastGasPrice } from '../helpers/utils/confirm-tx.util';
import { showSidebar } from '../store/actions';

/**
 * Provides a reusable hook that, given a transactionGroup, will return
 * a method for beginning the retry process
 *
 * @param {object} transactionGroup - the transaction group
 * @returns {Function} An event handler that starts the retry
 */
export function useRetryTransaction(transactionGroup) {
  const { primaryTransaction } = transactionGroup;
  // Signature requests do not have a txParams, but this hook is called indiscriminately
  const gasPrice = gasPriceForTransaction(primaryTransaction.txParams);
  const dispatch = useDispatch();

  const retryTransaction = useCallback(
    async (event) => {
      event.stopPropagation();

      if (!isFeeMarketTransaction(primaryTransaction.txParams)) {
        await dispatch(fetchBasicGasEstimates());
      }
      const transaction = primaryTransaction;
      const increasedGasPrice = increaseLastGasPrice(gasPrice);
      dispatch(
        setCustomGasPriceForRetry(
          increasedGasPrice || gasPriceForTransaction(transaction.txParams),
        ),
      );
      dispatch(setCustomGasLimit(transaction.txParams.gas));
      dispatch(
        showSidebar({
          transitionName: 'sidebar-left',
          type: 'customize-gas',
          props: { transaction },
        }),
      );
    },
    [dispatch, primaryTransaction, gasPrice],
  );

  return retryTransaction;
}
