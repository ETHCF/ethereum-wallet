import PropTypes from 'prop-types';
import React, { Component } from 'react';

import { ENVIRONMENT_TYPE_NOTIFICATION } from '../../../../app/scripts/lib/enums';
import { getEnvironmentType } from '../../../../app/scripts/lib/util';
import Button from '../../components/ui/button';
import Identicon from '../../components/ui/identicon';
import TokenBalance from '../../components/ui/token-balance';
import { closeNotificationWindow } from '../../store/actions';

export default class ConfirmAddSuggestedToken extends Component {
  static contextTypes = {
    t: PropTypes.func,
  };

  static propTypes = {
    navigate: PropTypes.func,
    acceptWatchAsset: PropTypes.func,
    rejectWatchAsset: PropTypes.func,
    mostRecentOverviewPage: PropTypes.string.isRequired,
    suggestion: PropTypes.shape({
      id: PropTypes.string.isRequired,
      origin: PropTypes.string,
      address: PropTypes.string.isRequired,
      symbol: PropTypes.string.isRequired,
      decimals: PropTypes.number.isRequired,
      image: PropTypes.string,
    }),
    tokens: PropTypes.array,
  };

  state = { answeringId: null };

  componentDidMount() {
    this._checkSuggestion();
  }

  componentWillUnmount() {
    this._unmounted = true;
  }

  /**
   * Answers a suggestion once. A second click before the answer is in would
   * answer it again, and fail, since it is already answered.
   *
   * @param {Function} respond - acceptWatchAsset or rejectWatchAsset.
   * @param {string} id - The suggestion's request id.
   */
  async _answer(respond, id) {
    if (this._answeringId === id) {
      return;
    }
    this._answeringId = id;
    this.setState({ answeringId: id });
    try {
      await respond(id);
    } finally {
      // A suggestion still pending afterwards, as when the answer could not
      // reach the background, can then be answered again.
      this._answeringId = null;
      if (!this._unmounted) {
        this.setState({ answeringId: null });
      }
    }
  }

  componentDidUpdate() {
    this._checkSuggestion();
  }

  _checkSuggestion() {
    const { mostRecentOverviewPage, suggestion, navigate } = this.props;

    if (suggestion) {
      return;
    }

    if (getEnvironmentType() === ENVIRONMENT_TYPE_NOTIFICATION) {
      closeNotificationWindow();
    } else {
      navigate(mostRecentOverviewPage);
    }
  }

  render() {
    const { t } = this.context;
    const { acceptWatchAsset, rejectWatchAsset, suggestion, tokens } =
      this.props;
    if (!suggestion) {
      return null;
    }
    const { id, origin, address, symbol, image } = suggestion;
    const answering = this.state.answeringId === id;
    const isKnownToken = tokens.some((token) => token.address === address);
    // A token that takes the symbol of a different one already added could
    // be mistaken for it.
    const reusesName = tokens.some(
      (token) => token.symbol === symbol && token.address !== address,
    );

    return (
      <div className="page-container">
        <div className="page-container__header">
          <div className="page-container__title">{t('addSuggestedTokens')}</div>
          <div
            className="page-container__subtitle"
            data-testid="suggested-token-origin"
          >
            {t('siteSuggestsToken', [origin])}
          </div>
          {isKnownToken ? (
            <div className="warning">{t('knownTokenWarning')}</div>
          ) : null}
          {reusesName ? (
            <div className="warning">{t('reusedTokenNameWarning')}</div>
          ) : null}
        </div>
        <div className="page-container__content">
          <div className="confirm-add-token">
            <div className="confirm-add-token__header">
              <div className="confirm-add-token__token">{t('token')}</div>
              <div className="confirm-add-token__balance">{t('balance')}</div>
            </div>
            <div className="confirm-add-token__token-list">
              <div className="confirm-add-token__token-list-item">
                <div className="confirm-add-token__token confirm-add-token__data">
                  <Identicon
                    className="confirm-add-token__token-icon"
                    diameter={48}
                    address={address}
                    image={image}
                  />
                  <div className="confirm-add-token__name">{symbol}</div>
                </div>
                <div className="confirm-add-token__balance">
                  <TokenBalance token={suggestion} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="page-container__footer">
          <footer>
            <Button
              type="default"
              large
              className="page-container__footer-button"
              data-testid="suggested-token-cancel"
              disabled={answering}
              onClick={() => this._answer(rejectWatchAsset, id)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="secondary"
              large
              className="page-container__footer-button"
              data-testid="suggested-token-add"
              disabled={answering}
              onClick={() => this._answer(acceptWatchAsset, id)}
            >
              {t('addToken')}
            </Button>
          </footer>
        </div>
      </div>
    );
  }
}
