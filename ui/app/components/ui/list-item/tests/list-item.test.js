import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';
import Sinon from 'sinon';

import Preloader from '../../icon/preloader/preloader-icon.component';
import Send from '../../icon/send-icon.component';
import ListItem from '../list-item.component';

const TITLE = 'Hello World';
const SUBTITLE = <p>I am a list item</p>;
const CLASSNAME = 'list-item-test';
const RIGHT_CONTENT = <p>Content rendered to the right</p>;
const CHILDREN = <button>I am a button</button>;
const MID_CONTENT = <p>Content rendered in the middle</p>;

describe('ListItem', function () {
  let wrapper;
  let clickHandler;

  before(function () {
    clickHandler = Sinon.fake();
    wrapper = shallow(
      <ListItem
        className={CLASSNAME}
        title={TITLE}
        data-testid="test-id"
        subtitle={SUBTITLE}
        rightContent={RIGHT_CONTENT}
        midContent={MID_CONTENT}
        icon={<Send />}
        titleIcon={<Preloader />}
        onClick={clickHandler}
      >
        {CHILDREN}
      </ListItem>,
    );
  });

  it('renders the passed props and content slots', function () {
    assert.equal(wrapper.props()['data-testid'], 'test-id');
    assert(wrapper.props().className.includes(CLASSNAME));
    assert.equal(wrapper.find('.list-item__heading h2').text(), TITLE);
    assert.equal(wrapper.find('.list-item__heading').props().title, TITLE);
    assert.equal(
      wrapper.find('.list-item__subheading').text(),
      'I am a list item',
    );
    assert.equal(
      wrapper.find('.list-item__right-content p').text(),
      'Content rendered to the right',
    );
    assert.equal(
      wrapper.find('.list-item__mid-content p').text(),
      'Content rendered in the middle',
    );
    assert.equal(
      wrapper.find('.list-item__actions button').text(),
      'I am a button',
    );
  });

  it('handles click action and fires onClick', function () {
    wrapper.simulate('click');
    assert.equal(clickHandler.callCount, 1);
  });

  after(function () {
    Sinon.restore();
  });
});
