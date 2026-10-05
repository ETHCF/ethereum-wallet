import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import Button from '../../components/ui/button';
import { getMostRecentOverviewPage } from '../../ducks/history/history';
import { getNetworkDisplayName } from '../../helpers/utils/network-display';
import { useI18nContext } from '../../hooks/useI18nContext';
import { getNetworkRequests } from '../../selectors/selectors';
import {
  approveNetworkRequest,
  rejectNetworkRequest,
} from '../../store/actions';

function hostOf(origin) {
  try {
    return new URL(origin).host;
  } catch (_) {
    return origin;
  }
}

export default function ConfirmNetworkRequest() {
  const t = useI18nContext();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [request] = useSelector(getNetworkRequests);
  const provider = useSelector((state) => state.ecfWallet.provider);
  const mostRecentOverviewPage = useSelector(getMostRecentOverviewPage);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!request) {
      navigate(mostRecentOverviewPage);
    }
  }, [request, navigate, mostRecentOverviewPage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears a previous request's error when the next request is shown
    setError(null);
  }, [request?.id]);

  if (!request) {
    return null;
  }

  const { id, origin, type, network, warnings } = request;
  const isAdd = type === 'add';
  const respond = async (action) => {
    setSubmitting(true);
    setError(null);
    try {
      await dispatch(action(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const rows = [
    [t('networkName'), network.chainName],
    [t('chainId'), `${parseInt(network.chainId, 16)} (${network.chainId})`],
    [t('symbol'), network.ticker],
    network.rpcUrl && [t('rpcUrl'), network.rpcUrl],
    network.blockExplorerUrl && [
      t('blockExplorerUrl'),
      network.blockExplorerUrl,
    ],
    [t('networkRequestCurrentNetwork'), getNetworkDisplayName(provider, t)],
  ].filter(Boolean);

  return (
    <div
      className="page-container confirm-network-request"
      data-testid="confirm-network-request"
    >
      <div className="page-container__header">
        <div className="page-container__title">
          {t(isAdd ? 'networkRequestAddTitle' : 'networkRequestSwitchTitle')}
        </div>
        <div className="page-container__subtitle">
          {t(
            isAdd
              ? 'networkRequestAddDescription'
              : 'networkRequestSwitchDescription',
            [hostOf(origin)],
          )}
        </div>
      </div>
      <div className="page-container__content confirm-network-request__content">
        <div className="confirm-network-request__origin">{origin}</div>
        <dl className="confirm-network-request__details">
          {rows.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt>{label}</dt>
              <dd className="notranslate">{value}</dd>
            </React.Fragment>
          ))}
        </dl>
        {warnings.map(([key, args]) => (
          <div
            key={key}
            className={
              key === 'networkRequestRpcNotice'
                ? 'confirm-network-request__notice'
                : 'confirm-network-request__warning'
            }
            data-testid={`network-request-${key}`}
          >
            {t(key, args)}
          </div>
        ))}
        {error && <div className="confirm-network-request__error">{error}</div>}
      </div>
      <div className="page-container__footer">
        <footer>
          <Button
            type="default"
            large
            className="page-container__footer-button"
            data-testid="network-request-reject"
            disabled={submitting}
            onClick={() => respond(rejectNetworkRequest)}
          >
            {t('reject')}
          </Button>
          <Button
            type="secondary"
            large
            className="page-container__footer-button"
            data-testid="network-request-approve"
            disabled={submitting}
            onClick={() => respond(approveNetworkRequest)}
          >
            {t(
              isAdd
                ? 'networkRequestApproveAdd'
                : 'networkRequestApproveSwitch',
            )}
          </Button>
        </footer>
      </div>
    </div>
  );
}
