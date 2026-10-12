import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import { Provider } from 'react-redux';
import { HashRouter } from 'react-router-dom';

import ErrorPage from './error';
import Routes from './routes';
import { I18nProvider, LegacyI18nProvider } from '../contexts/i18n';

class Index extends PureComponent {
  state = {};

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    const { error, errorId } = this.state;
    const { store } = this.props;

    if (error) {
      return (
        <Provider store={store}>
          <I18nProvider>
            <LegacyI18nProvider>
              <ErrorPage error={error} errorId={errorId} />
            </LegacyI18nProvider>
          </I18nProvider>
        </Provider>
      );
    }

    return (
      <Provider store={store}>
        <HashRouter>
          <I18nProvider>
            <LegacyI18nProvider>
              <Routes />
            </LegacyI18nProvider>
          </I18nProvider>
        </HashRouter>
      </Provider>
    );
  }
}

Index.propTypes = {
  store: PropTypes.object,
};

export default Index;
