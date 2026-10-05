import assert from 'assert';
import { mount } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import SecurityTab from '..';

describe('Security Tab', function () {
  let wrapper;

  const props = {
    revealSeedConfirmation: sinon.spy(),
    showClearApprovalModal: sinon.spy(),
    displayWarning: sinon.spy(),
    navigate: sinon.spy(),
    privacyMode: true,
    warning: '',
    setUsePhishDetect: sinon.spy(),
    usePhishDetect: true,
  };

  beforeEach(function () {
    wrapper = mount(<SecurityTab.WrappedComponent {...props} />, {
      context: {
        t: (str) => str,
      },
    });
  });

  it('navigates to reveal seed words page', function () {
    const seedWords = wrapper.find('.button.btn-danger.btn--large');

    seedWords.simulate('click');
    assert(props.navigate.calledOnce);
    assert.equal(props.navigate.getCall(0).args[0], '/seed');
  });

  it('toggles phishing detection', function () {
    const phishDetect = wrapper.find('[role="switch"]').at(0);
    phishDetect.simulate('click');
    assert(props.setUsePhishDetect.calledOnce);
  });
});
