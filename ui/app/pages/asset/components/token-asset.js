import PropTypes from 'prop-types';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import AssetNavigation from './asset-navigation';
import TokenOptions from './token-options';
import getAccountLink from '../../../../lib/account-link';
import TransactionList from '../../../components/app/transaction-list';
import { TokenOverview } from '../../../components/app/wallet-overview';
import { DEFAULT_ROUTE } from '../../../helpers/constants/routes';
import {
  getCurrentNetworkId,
  getRpcPrefsForCurrentProvider,
  getSelectedIdentity,
} from '../../../selectors/selectors';
import { showModal } from '../../../store/actions';

export default function TokenAsset({ token }) {
  const dispatch = useDispatch();
  const network = useSelector(getCurrentNetworkId);
  const rpcPrefs = useSelector(getRpcPrefsForCurrentProvider);
  const selectedAccountName = useSelector(
    (state) => getSelectedIdentity(state).name,
  );
  const navigate = useNavigate();

  return (
    <>
      <AssetNavigation
        accountName={selectedAccountName}
        assetName={token.symbol}
        onBack={() => navigate(DEFAULT_ROUTE)}
        optionsButton={
          <TokenOptions
            onRemove={() =>
              dispatch(showModal({ name: 'HIDE_TOKEN_CONFIRMATION', token }))
            }
            onViewEtherscan={() => {
              const url = getAccountLink(token.address, network, rpcPrefs);
              if (url) {
                global.platform.openTab({ url });
              }
            }}
            tokenSymbol={token.symbol}
          />
        }
      />
      <TokenOverview className="asset__overview" token={token} />
      <TransactionList tokenAddress={token.address} />
    </>
  );
}

TokenAsset.propTypes = {
  token: PropTypes.shape({
    address: PropTypes.string.isRequired,
    decimals: PropTypes.number,
    symbol: PropTypes.string,
  }).isRequired,
};
