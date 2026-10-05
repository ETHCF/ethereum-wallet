import PropTypes from 'prop-types';
import React, { Component } from 'react';

import { getHelpUrl } from '../../../helpers/constants/help';

export default class PermissionsConnectFooter extends Component {
  static contextTypes = {
    t: PropTypes.func,
  };

  render() {
    const { t } = this.context;
    return (
      <div className="permissions-connect-footer">
        <div className="permissions-connect-footer__text">
          <div>{t('onlyConnectTrust')}</div>
          <a
            className="permissions-connect-footer__text--link"
            rel="noopener noreferrer"
            target="_blank"
            href={getHelpUrl('safety-tips')}
          >
            {t('learnMore')}
          </a>
        </div>
      </div>
    );
  }
}
