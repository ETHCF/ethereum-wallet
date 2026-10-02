import assert from 'assert'
import React from 'react'
import sinon from 'sinon'
import configureMockStore from 'redux-mock-store'
import { mountWithRouter } from '../../../../../test/lib/render-helpers'
import CreateAccountPage from '..'

describe('Create Account Page', function () {
  let wrapper

  const props = {
    navigate: sinon.spy(),
    location: {
      pathname: '/new-account',
    },
  }

  before(function () {
    // The new account form is the default tab.
    const store = configureMockStore()({
      ecfWallet: { identities: {} },
      history: { mostRecentOverviewPage: '/' },
    })
    wrapper = mountWithRouter(
      <CreateAccountPage {...props} />,
      store,
    )
  })

  afterEach(function () {
    props.navigate.resetHistory()
  })

  it('clicks create account and routes to new-account path', function () {
    const createAccount = wrapper.find('.new-account__tabs__tab').at(0)
    createAccount.simulate('click')
    assert.equal(props.navigate.getCall(0).args[0], '/new-account')
  })

  it('clicks import account and routes to import new account path', function () {
    const importAccount = wrapper.find('.new-account__tabs__tab').at(1)
    importAccount.simulate('click')
    assert.equal(props.navigate.getCall(0).args[0], '/new-account/import')
  })

  it('clicks connect HD Wallet and routes to connect new account path', function () {
    const connectHdWallet = wrapper.find('.new-account__tabs__tab').at(2)
    connectHdWallet.simulate('click')
    assert.equal(props.navigate.getCall(0).args[0], '/new-account/connect')
  })
})
