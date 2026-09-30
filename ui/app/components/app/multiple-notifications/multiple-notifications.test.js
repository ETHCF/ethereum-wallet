import { strict as assert } from 'assert'
import React from 'react'
import { shallow } from 'enzyme'
import MultipleNotifications from './multiple-notifications.component'

describe('MultipleNotifications', function () {
  it('handles an absent or single notification after cloud restore is removed', function () {
    const empty = shallow(<MultipleNotifications>{null}</MultipleNotifications>)
    assert.equal(empty.isEmptyRender(), true)
    const single = shallow(<MultipleNotifications><span>Back up your recovery phrase</span></MultipleNotifications>)
    assert.equal(single.find('span').text(), 'Back up your recovery phrase')
    assert.equal(single.find('i').length, 0)
  })
})
