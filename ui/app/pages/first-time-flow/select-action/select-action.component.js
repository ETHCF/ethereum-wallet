import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';

import Button from '../../../components/ui/button';
import MetaFoxLogo from '../../../components/ui/metafox-logo';
import {
  INITIALIZE_CREATE_PASSWORD_ROUTE,
  INITIALIZE_IMPORT_WITH_SEED_PHRASE_ROUTE,
} from '../../../helpers/constants/routes';

export default class SelectAction extends PureComponent {
  static propTypes = {
    navigate: PropTypes.func,
    isInitialized: PropTypes.bool,
    setFirstTimeFlowType: PropTypes.func,
    nextRoute: PropTypes.string,
  };

  static contextTypes = {
    t: PropTypes.func,
  };

  componentDidMount() {
    const { navigate, isInitialized, nextRoute } = this.props;

    if (isInitialized) {
      navigate(nextRoute);
    }
  }

  handleCreate = () => {
    this.props.setFirstTimeFlowType('create');
    this.props.navigate(INITIALIZE_CREATE_PASSWORD_ROUTE);
  };

  handleImport = () => {
    this.props.setFirstTimeFlowType('import');
    this.props.navigate(INITIALIZE_IMPORT_WITH_SEED_PHRASE_ROUTE);
  };

  render() {
    const { t } = this.context;

    return (
      <div className="select-action">
        <MetaFoxLogo />

        <div className="select-action__wrapper">
          <div className="select-action__body">
            <div className="select-action__body-header">
              {t('newToEcfWallet')}
            </div>
            <div className="select-action__select-buttons">
              <div className="select-action__select-button">
                <div className="select-action__button-content">
                  <div className="select-action__button-symbol">
                    <img src="/images/download-alt.svg" />
                  </div>
                  <div className="select-action__button-text-big">
                    {t('noAlreadyHaveSeed')}
                  </div>
                  <div className="select-action__button-text-small">
                    {t('importYourExisting')}
                  </div>
                </div>
                <Button
                  type="primary"
                  className="first-time-flow__button"
                  onClick={this.handleImport}
                >
                  {t('importWallet')}
                </Button>
              </div>
              <div className="select-action__select-button">
                <div className="select-action__button-content">
                  <div className="select-action__button-symbol">
                    <img src="/images/thin-plus.svg" />
                  </div>
                  <div className="select-action__button-text-big">
                    {t('letsGoSetUp')}
                  </div>
                  <div className="select-action__button-text-small">
                    {t('thisWillCreate')}
                  </div>
                </div>
                <Button
                  type="primary"
                  className="first-time-flow__button"
                  onClick={this.handleCreate}
                >
                  {t('createAWallet')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
