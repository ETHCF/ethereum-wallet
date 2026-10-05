import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import PageFooter from '../page-container-footer.component';

describe('Page Footer', function () {
  let wrapper;
  const onCancel = sinon.spy();
  const onSubmit = sinon.spy();

  beforeEach(function () {
    wrapper = shallow(
      <PageFooter
        onCancel={onCancel}
        onSubmit={onSubmit}
        cancelText="Cancel"
        submitText="Submit"
        disabled={false}
        submitButtonType="Test Type"
      />,
    );
  });

  it('should render a secondary footer inside page-container__footer when given children', function () {
    wrapper = shallow(
      <PageFooter>
        <div>Works</div>
      </PageFooter>,
      { context: { t: sinon.spy((k) => `[${k}]`) } },
    );

    assert.equal(wrapper.find('.page-container__footer-secondary').length, 1);
  });

  it('passes text, type and disabled props to the buttons', function () {
    const buttons = wrapper.find('.page-container__footer-button');
    assert.equal(buttons.first().prop('children'), 'Cancel');
    assert.equal(buttons.last().prop('children'), 'Submit');
    assert.equal(buttons.last().prop('type'), 'Test Type');
    assert.equal(buttons.last().prop('disabled'), false);
  });

  describe('Cancel Button', function () {
    it('should call cancel when click is simulated', function () {
      wrapper.find('.page-container__footer-button').first().prop('onClick')();
      assert.equal(onCancel.callCount, 1);
    });
  });

  describe('Submit Button', function () {
    it('should call submit when click is simulated', function () {
      wrapper.find('.page-container__footer-button').last().prop('onClick')();
      assert.equal(onSubmit.callCount, 1);
    });
  });
});
