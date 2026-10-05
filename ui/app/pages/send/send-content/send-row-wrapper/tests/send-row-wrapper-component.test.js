import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';

import SendRowErrorMessage from '../send-row-error-message/send-row-error-message.container';
import SendRowWrapper from '../send-row-wrapper.component';

describe('SendContent Component', function () {
  let wrapper;

  describe('render', function () {
    beforeEach(function () {
      wrapper = shallow(
        <SendRowWrapper
          errorType="mockErrorType"
          label="mockLabel"
          showError={false}
        >
          <span>Mock Form Field</span>
        </SendRowWrapper>,
      );
    });

    it('should render the label as a child of the send-v2__form-label', function () {
      assert.equal(
        wrapper
          .find('.send-v2__form-row > .send-v2__form-label')
          .childAt(0)
          .text(),
        'mockLabel',
      );
    });

    it('should render its first child as a child of the send-v2__form-field', function () {
      assert.equal(
        wrapper
          .find('.send-v2__form-row > .send-v2__form-field')
          .childAt(0)
          .text(),
        'Mock Form Field',
      );
    });

    it('should not render a SendRowErrorMessage if showError is false', function () {
      assert.equal(wrapper.find(SendRowErrorMessage).length, 0);
    });

    it('should render a SendRowErrorMessage with and errorType props if showError is true', function () {
      wrapper.setProps({ showError: true });
      assert.equal(wrapper.find(SendRowErrorMessage).length, 1);

      const expectedSendRowErrorMessage = wrapper
        .find('.send-v2__form-row > .send-v2__form-label')
        .childAt(1);
      assert(expectedSendRowErrorMessage.is(SendRowErrorMessage));
      assert.deepEqual(expectedSendRowErrorMessage.props(), {
        errorType: 'mockErrorType',
      });
    });

    it('should render its second child as a child of the send-v2__form-field, if it has two children', function () {
      wrapper = shallow(
        <SendRowWrapper
          errorType="mockErrorType"
          label="mockLabel"
          showError={false}
        >
          <span>Mock Custom Label Content</span>
          <span>Mock Form Field</span>
        </SendRowWrapper>,
      );
      assert.equal(
        wrapper
          .find('.send-v2__form-row > .send-v2__form-field')
          .childAt(0)
          .text(),
        'Mock Form Field',
      );
    });

    it('should render its first child as the last child of the send-v2__form-label, if it has two children', function () {
      wrapper = shallow(
        <SendRowWrapper
          errorType="mockErrorType"
          label="mockLabel"
          showError={false}
        >
          <span>Mock Custom Label Content</span>
          <span>Mock Form Field</span>
        </SendRowWrapper>,
      );
      assert.equal(
        wrapper
          .find('.send-v2__form-row > .send-v2__form-label')
          .childAt(1)
          .text(),
        'Mock Custom Label Content',
      );
    });
  });
});
