import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';

import Button from '../../../components/ui/button';
import { INITIALIZE_SELECT_ACTION_ROUTE } from '../../../helpers/constants/routes';

export default class Welcome extends PureComponent {
  static propTypes = {
    navigate: PropTypes.func,
  };

  static contextTypes = {
    t: PropTypes.func,
  };

  handleContinue = () => {
    this.props.navigate(INITIALIZE_SELECT_ACTION_ROUTE);
  };

  render() {
    const { t } = this.context;

    return (
      <div className="welcome-page__wrapper">
        <div className="welcome-page">
          <div className="welcome-page__header">{t('welcome')}</div>
          <div className="welcome-page__description">
            <div>{t('ecfWalletDescription')}</div>
            <div>{t('happyToSeeYou')}</div>
          </div>
          <Button
            type="primary"
            className="first-time-flow__button"
            onClick={this.handleContinue}
          >
            {t('getStarted')}
          </Button>
        </div>
      </div>
    );
  }
}
