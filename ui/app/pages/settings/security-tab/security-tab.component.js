import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';

import Button from '../../../components/ui/button';
import ToggleButton from '../../../components/ui/toggle-button';
import { REVEAL_SEED_ROUTE } from '../../../helpers/constants/routes';

export default class SecurityTab extends PureComponent {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    warning: PropTypes.string,
    navigate: PropTypes.func,
    setUsePhishDetect: PropTypes.func.isRequired,
    usePhishDetect: PropTypes.bool.isRequired,
    setUse4ByteResolution: PropTypes.func.isRequired,
    use4ByteResolution: PropTypes.bool.isRequired,
    setRejectRequestsOnClose: PropTypes.func.isRequired,
    rejectRequestsOnClose: PropTypes.bool.isRequired,
    setUseNftDetection: PropTypes.func.isRequired,
    useNftDetection: PropTypes.bool.isRequired,
    setDisplayNftMedia: PropTypes.func.isRequired,
    displayNftMedia: PropTypes.bool.isRequired,
  };

  renderSeedWords() {
    const { t } = this.context;
    const { navigate } = this.props;

    return (
      <div className="settings-page__content-row">
        <div className="settings-page__content-item">
          <span>{t('revealSeedWords')}</span>
        </div>
        <div className="settings-page__content-item">
          <div className="settings-page__content-item-col">
            <Button
              type="danger"
              large
              onClick={(event) => {
                event.preventDefault();
                navigate(REVEAL_SEED_ROUTE);
              }}
            >
              {t('revealSeedWords')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  renderPhishingDetectionToggle() {
    const { t } = this.context;
    const { usePhishDetect, setUsePhishDetect } = this.props;

    return (
      <div className="settings-page__content-row">
        <div className="settings-page__content-item">
          <span>{t('usePhishingDetection')}</span>
          <div className="settings-page__content-description">
            {t('usePhishingDetectionDescription')}
          </div>
        </div>
        <div className="settings-page__content-item">
          <div className="settings-page__content-item-col">
            <ToggleButton
              value={usePhishDetect}
              onToggle={(value) => setUsePhishDetect(!value)}
              offLabel={t('off')}
              onLabel={t('on')}
            />
          </div>
        </div>
      </div>
    );
  }

  render4ByteResolutionToggle() {
    const { t } = this.context;
    const { use4ByteResolution, setUse4ByteResolution } = this.props;

    return (
      <div className="settings-page__content-row">
        <div className="settings-page__content-item">
          <span>{t('use4ByteResolution')}</span>
          <div className="settings-page__content-description">
            {t('use4ByteResolutionDescription')}
          </div>
        </div>
        <div className="settings-page__content-item">
          <div className="settings-page__content-item-col">
            <ToggleButton
              value={use4ByteResolution}
              onToggle={(value) => setUse4ByteResolution(!value)}
              offLabel={t('off')}
              onLabel={t('on')}
            />
          </div>
        </div>
      </div>
    );
  }

  renderToggle({ title, description, value, onToggle, testId }) {
    const { t } = this.context;

    return (
      <div className="settings-page__content-row" data-testid={testId}>
        <div className="settings-page__content-item">
          <span>{title}</span>
          <div className="settings-page__content-description">
            {description}
          </div>
        </div>
        <div className="settings-page__content-item">
          <div className="settings-page__content-item-col">
            <ToggleButton
              value={value}
              onToggle={(current) => onToggle(!current)}
              offLabel={t('off')}
              onLabel={t('on')}
            />
          </div>
        </div>
      </div>
    );
  }

  renderRejectOnCloseToggle() {
    const { t } = this.context;
    const { rejectRequestsOnClose, setRejectRequestsOnClose } = this.props;

    return this.renderToggle({
      title: t('rejectRequestsOnClose'),
      description: t('rejectRequestsOnCloseDescription'),
      value: rejectRequestsOnClose,
      onToggle: setRejectRequestsOnClose,
      testId: 'reject-on-close-toggle',
    });
  }

  renderNftToggles() {
    const { t } = this.context;
    const {
      useNftDetection,
      setUseNftDetection,
      displayNftMedia,
      setDisplayNftMedia,
    } = this.props;

    return (
      <>
        {this.renderToggle({
          title: t('useNftDetection'),
          description: t('useNftDetectionDescription'),
          value: useNftDetection,
          onToggle: setUseNftDetection,
          testId: 'nft-detection-toggle',
        })}
        {/* Images are only for detected NFTs. */}
        {useNftDetection &&
          this.renderToggle({
            title: t('displayNftMedia'),
            description: t('displayNftMediaDescription'),
            value: displayNftMedia,
            onToggle: setDisplayNftMedia,
            testId: 'nft-media-toggle',
          })}
      </>
    );
  }

  render() {
    const { warning } = this.props;

    return (
      <div className="settings-page__body">
        {warning && <div className="settings-tab__error">{warning}</div>}
        {this.renderSeedWords()}
        {this.renderPhishingDetectionToggle()}
        {this.render4ByteResolutionToggle()}
        {this.renderRejectOnCloseToggle()}
        {this.renderNftToggles()}
      </div>
    );
  }
}
