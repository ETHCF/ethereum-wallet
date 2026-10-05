import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import ConfirmDetailRow from '../confirm-detail-row.component';

const propsMethodSpies = {
  onHeaderClick: sinon.spy(),
};

describe('Confirm Detail Row Component', function () {
  describe('render', function () {
    let wrapper;

    beforeEach(function () {
      wrapper = shallow(
        <ConfirmDetailRow
          errorType="mockErrorType"
          label="mockLabel"
          showError={false}
          primaryText="mockPrimaryText"
          primaryValueTextColor="mockColor"
          onHeaderClick={propsMethodSpies.onHeaderClick}
          headerText="mockHeaderText"
          headerTextClassName="mockHeaderClass"
        />,
      );
    });

    it('should render the label, headerText and primaryText', function () {
      assert.equal(
        wrapper
          .find('.confirm-detail-row > .confirm-detail-row__label')
          .childAt(0)
          .text(),
        'mockLabel',
      );
      assert.equal(
        wrapper
          .find(
            '.confirm-detail-row__details > .confirm-detail-row__header-text',
          )
          .childAt(0)
          .text(),
        'mockHeaderText',
      );
      assert.equal(
        wrapper
          .find('.confirm-detail-row__details > .confirm-detail-row__primary')
          .childAt(0)
          .text(),
        'mockPrimaryText',
      );
    });

    it('should assure the confirm-detail-row__header-text classname is correct', function () {
      assert.equal(
        wrapper.find('.confirm-detail-row__header-text').props().className,
        'confirm-detail-row__header-text mockHeaderClass',
      );
    });

    it('should call onHeaderClick when headerText div gets clicked', function () {
      wrapper.find('.confirm-detail-row__header-text').props().onClick();
      assert.ok(propsMethodSpies.onHeaderClick.calledOnce);
    });
  });
});
