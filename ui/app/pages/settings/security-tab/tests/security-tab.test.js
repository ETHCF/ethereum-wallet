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
    setUse4ByteResolution: sinon.spy(),
    use4ByteResolution: true,
    setUseNftDetection: sinon.spy(),
    useNftDetection: false,
    setDisplayNftMedia: sinon.spy(),
    displayNftMedia: false,
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

  it('turns off contract method lookups at 4byte.directory', function () {
    wrapper.find('[role="switch"]').at(1).simulate('click');
    assert(props.setUse4ByteResolution.calledOnceWithExactly(false));
  });

  it('turns on NFT detection, and offers NFT images only once it is on', function () {
    assert.equal(wrapper.find('[data-testid="nft-media-toggle"]').length, 0);
    wrapper
      .find('[data-testid="nft-detection-toggle"] [role="switch"]')
      .simulate('click');
    assert(props.setUseNftDetection.calledOnceWithExactly(true));

    const enabled = mount(
      <SecurityTab.WrappedComponent {...props} useNftDetection />,
      { context: { t: (str) => str } },
    );
    enabled
      .find('[data-testid="nft-media-toggle"] [role="switch"]')
      .simulate('click');
    assert(props.setDisplayNftMedia.calledOnceWithExactly(true));
  });
});
