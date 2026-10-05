import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import PageContainerHeader from '../page-container-header.component';

describe('Page Container Header', function () {
  let wrapper, style, onBackButtonClick, onClose;

  beforeEach(function () {
    style = { test: 'style' };
    onBackButtonClick = sinon.spy();
    onClose = sinon.spy();

    wrapper = shallow(
      <PageContainerHeader
        showBackButton
        onBackButtonClick={onBackButtonClick}
        backButtonStyles={style}
        title="Test Title"
        subtitle="Test Subtitle"
        tabs="Test Tab"
        onClose={onClose}
      />,
    );
  });

  describe('Render Header Row', function () {
    it('renders back button', function () {
      assert.equal(wrapper.find('.page-container__back-button').length, 1);
      assert.equal(wrapper.find('.page-container__back-button').text(), 'Back');
    });

    it('should call back button when click is simulated', function () {
      wrapper.find('.page-container__back-button').prop('onClick')();
      assert.equal(onBackButtonClick.callCount, 1);
    });
  });

  describe('Render', function () {
    it('renders title, subtitle and tabs', function () {
      assert.equal(wrapper.find('.page-container__title').text(), 'Test Title');
      assert.equal(
        wrapper.find('.page-container__subtitle').text(),
        'Test Subtitle',
      );
      assert.equal(wrapper.find('.page-container__tabs').text(), 'Test Tab');
    });

    it('should call close when click is simulated', function () {
      wrapper.find('.page-container__header-close').prop('onClick')();
      assert.equal(onClose.callCount, 1);
    });
  });
});
