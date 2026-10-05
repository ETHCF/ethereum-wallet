import PropTypes from 'prop-types';
import React, { useContext } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import WalletOverview from './wallet-overview';
import { I18nContext } from '../../../contexts/i18n';
import { SEND_ROUTE } from '../../../helpers/constants/routes';
import { useTokenTracker } from '../../../hooks/useTokenTracker';
import { getAssetImages } from '../../../selectors/selectors';
import { updateSendToken } from '../../../store/actions';
import Button from '../../ui/button';
import CurrencyDisplay from '../../ui/currency-display';
import Identicon from '../../ui/identicon';

const TokenOverview = ({ className, token }) => {
  const dispatch = useDispatch();
  const t = useContext(I18nContext);
  const navigate = useNavigate();
  const assetImages = useSelector(getAssetImages);
  const { tokensWithBalances } = useTokenTracker([token]);
  const balance = tokensWithBalances[0]?.string;

  return (
    <WalletOverview
      balance={
        <div className="token-overview__balance">
          <CurrencyDisplay
            className="token-overview__primary-balance"
            displayValue={balance}
            suffix={token.symbol}
          />
        </div>
      }
      buttons={
        <Button
          type="secondary"
          className="token-overview__button"
          onClick={() => {
            dispatch(updateSendToken(token));
            navigate(SEND_ROUTE);
          }}
        >
          {t('send')}
        </Button>
      }
      className={className}
      icon={
        <Identicon
          diameter={32}
          address={token.address}
          image={assetImages[token.address]}
        />
      }
    />
  );
};

TokenOverview.propTypes = {
  className: PropTypes.string,
  token: PropTypes.shape({
    address: PropTypes.string.isRequired,
    decimals: PropTypes.number,
    symbol: PropTypes.string,
  }).isRequired,
};

TokenOverview.defaultProps = {
  className: undefined,
};

export default TokenOverview;
