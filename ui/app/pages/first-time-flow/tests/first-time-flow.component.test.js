import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import { INITIALIZE_UNLOCK_ROUTE } from '../../../helpers/constants/routes';
import FirstTimeFlow from '../first-time-flow.component';

describe('FirstTimeFlow', function () {
  const render = (props) => {
    const navigate = sinon.spy();
    const wrapper = shallow(
      <FirstTimeFlow isInitialized isUnlocked navigate={navigate} {...props} />,
    );
    wrapper.setState({ seedPhrase: 'dummy recovery phrase' });
    return { navigate, wrapper };
  };

  it('discards the seed phrase and goes to unlock when the wallet locks', function () {
    const { navigate, wrapper } = render();

    wrapper.setProps({ isUnlocked: false });

    assert.equal(wrapper.state('seedPhrase'), '');
    assert(navigate.calledOnceWithExactly(INITIALIZE_UNLOCK_ROUTE));
  });

  it('keeps the seed phrase while the wallet stays unlocked', function () {
    const { navigate, wrapper } = render();

    wrapper.setProps({ seedPhraseBackedUp: true });

    assert.equal(wrapper.state('seedPhrase'), 'dummy recovery phrase');
    assert(navigate.notCalled);
  });

  it('does not navigate when the wallet unlocks', function () {
    const { navigate, wrapper } = render({ isUnlocked: false });
    navigate.resetHistory();

    wrapper.setProps({ isUnlocked: true });

    assert(navigate.notCalled);
  });
});
