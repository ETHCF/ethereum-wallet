import classnames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import { useSelector } from 'react-redux';

import { formatTokenBalance } from '../../../helpers/utils/util';
import { useI18nContext } from '../../../hooks/useI18nContext';
import { getSelectedAddress } from '../../../selectors';
import AssetListItem from '../asset-list-item';

export default function TokenCell({
  address,
  balance,
  decimals,
  outdatedBalance,
  symbol,
  string,
  image,
  onClick,
}) {
  const userAddress = useSelector(getSelectedAddress);
  const t = useI18nContext();

  const warning = outdatedBalance ? (
    <span>
      {t('troubleTokenBalances')}
      <a
        href={`https://ethplorer.io/address/${userAddress}`}
        rel="noopener noreferrer"
        target="_blank"
      >
        {t('here')}
      </a>
    </span>
  ) : null;

  return (
    <AssetListItem
      className={classnames('token-cell', {
        'token-cell--outdated': outdatedBalance,
      })}
      iconClassName="token-cell__icon"
      onClick={onClick.bind(null, address)}
      tokenAddress={address}
      tokenImage={image}
      tokenSymbol={symbol}
      tokenDecimals={decimals}
      warning={warning}
      primary={`${formatTokenBalance({ balance, decimals }) || string || 0} ${symbol}`}
    />
  );
}

TokenCell.propTypes = {
  address: PropTypes.string,
  balance: PropTypes.string,
  outdatedBalance: PropTypes.bool,
  symbol: PropTypes.string,
  decimals: PropTypes.number,
  string: PropTypes.string,
  image: PropTypes.string,
  onClick: PropTypes.func.isRequired,
};

TokenCell.defaultProps = {
  outdatedBalance: false,
};
