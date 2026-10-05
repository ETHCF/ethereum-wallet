import classnames from 'classnames';
import PropTypes from 'prop-types';
import React, { useContext } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import WalletOverview from './wallet-overview';
import { I18nContext } from '../../../contexts/i18n';
import { SEND_ROUTE } from '../../../helpers/constants/routes';
import {
  isBalanceCached,
  getSelectedAccount,
} from '../../../selectors/selectors';
import { showModal } from '../../../store/actions';
import Button from '../../ui/button';
import Identicon from '../../ui/identicon';
import Tooltip from '../../ui/tooltip';
import UserPreferencedCurrencyDisplay from '../user-preferenced-currency-display';

const EthOverview = ({ className }) => {
  const dispatch = useDispatch();
  const t = useContext(I18nContext);
  const navigate = useNavigate();
  const balanceIsCached = useSelector(isBalanceCached);
  const selectedAccount = useSelector(getSelectedAccount);
  const { balance } = selectedAccount;

  return (
    <WalletOverview
      balance={
        <Tooltip
          position="top"
          title={t('balanceOutdated')}
          disabled={!balanceIsCached}
        >
          <div className="eth-overview__balance">
            <div className="eth-overview__primary-container">
              <UserPreferencedCurrencyDisplay
                className={classnames('eth-overview__primary-balance', {
                  'eth-overview__cached-balance': balanceIsCached,
                })}
                data-testid="eth-overview__primary-currency"
                value={balance}
                ethNumberOfDecimals={4}
                hideTitle
              />
              {balanceIsCached ? (
                <span className="eth-overview__cached-star">*</span>
              ) : null}
            </div>
          </div>
        </Tooltip>
      }
      buttons={
        <>
          <Button
            type="primary"
            className="eth-overview__button"
            onClick={() => {
              dispatch(showModal({ name: 'ACCOUNT_DETAILS' }));
            }}
          >
            {t('receive')}
          </Button>
          <Button
            type="secondary"
            className="eth-overview__button"
            onClick={() => {
              navigate(SEND_ROUTE);
            }}
            data-testid="eth-overview-send"
          >
            {t('send')}
          </Button>
        </>
      }
      className={className}
      icon={<Identicon diameter={32} />}
    />
  );
};

EthOverview.propTypes = {
  className: PropTypes.string,
};

EthOverview.defaultProps = {
  className: undefined,
};

export default EthOverview;
