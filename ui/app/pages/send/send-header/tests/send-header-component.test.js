import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import PageContainerHeader from '../../../../components/ui/page-container/page-container-header';
import SendHeader from '../send-header.component';

describe('SendHeader Component', function () {
  let wrapper;

  const propsMethodSpies = {
    clearSend: sinon.spy(),
  };
  const navigateSpy = sinon.spy();

  before(function () {
    sinon.spy(SendHeader.prototype, 'onClose');
  });

  beforeEach(function () {
    wrapper = shallow(
      <SendHeader
        clearSend={propsMethodSpies.clearSend}
        navigate={navigateSpy}
        mostRecentOverviewPage="mostRecentOverviewPage"
        titleKey="mockTitleKey"
      />,
      { context: { t: (str1, str2) => (str2 ? str1 + str2 : str1) } },
    );
  });

  afterEach(function () {
    propsMethodSpies.clearSend.resetHistory();
    navigateSpy.resetHistory();
    SendHeader.prototype.onClose.resetHistory();
  });

  after(function () {
    sinon.restore();
  });

  describe('onClose', function () {
    it('should call clearSend', function () {
      assert.equal(propsMethodSpies.clearSend.callCount, 0);
      wrapper.instance().onClose();
      assert.equal(propsMethodSpies.clearSend.callCount, 1);
    });

    it('should call navigate', function () {
      assert.equal(navigateSpy.callCount, 0);
      wrapper.instance().onClose();
      assert.equal(navigateSpy.callCount, 1);
      assert.equal(navigateSpy.getCall(0).args[0], 'mostRecentOverviewPage');
    });
  });

  describe('render', function () {
    it('should pass the correct props to PageContainerHeader', function () {
      const { onClose, title } = wrapper.find(PageContainerHeader).props();
      assert.equal(title, 'mockTitleKey');
      assert.equal(SendHeader.prototype.onClose.callCount, 0);
      onClose();
      assert.equal(SendHeader.prototype.onClose.callCount, 1);
    });
  });
});
