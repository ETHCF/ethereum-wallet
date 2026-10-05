import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';

import Loading from '../../components/ui/loading-screen';
import { DEFAULT_ROUTE } from '../../helpers/constants/routes';

export default class Lock extends PureComponent {
  static propTypes = {
    navigate: PropTypes.func,
    isUnlocked: PropTypes.bool,
    lockEcfWallet: PropTypes.func,
  };

  componentDidMount() {
    const { lockEcfWallet, isUnlocked, navigate } = this.props;

    if (isUnlocked) {
      // eslint-disable-next-line promise/catch-or-return -- fire-and-forget from componentDidMount; adding a catch would swallow errors
      lockEcfWallet().then(() => navigate(DEFAULT_ROUTE));
    } else {
      navigate(DEFAULT_ROUTE, { replace: true });
    }
  }

  render() {
    return <Loading />;
  }
}
