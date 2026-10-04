import assert from 'assert'
import React from 'react'
import { mount } from 'enzyme'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import en from '../../../../../app/_locales/en/messages.json'
import {
  PRIVACY_POLICY_SECTIONS,
  getPrivacyPolicyUrl,
} from '../../../helpers/constants/privacy-policy'
import { PRIVACY_POLICY_ROUTE } from '../../../helpers/constants/routes'
import PrivacyPolicy from '..'
import { ROUTER_FUTURE_FLAGS } from '../../../helpers/constants/router'

describe('Privacy Policy page', function () {
  it('renders every section', function () {
    const wrapper = mount(
      <MemoryRouter initialEntries={[PRIVACY_POLICY_ROUTE]} future={ROUTER_FUTURE_FLAGS}>
        <Routes>
          <Route path={PRIVACY_POLICY_ROUTE} element={<PrivacyPolicy />} />
        </Routes>
      </MemoryRouter>,
    )
    assert.equal(wrapper.find('.legal-document__title').text(), '[privacyMsg]')
    assert.equal(wrapper.find('.legal-document__updated').text(), '[legalLastUpdated]')
    assert.deepEqual(
      wrapper.find('.legal-document__heading').map((heading) => heading.text()),
      PRIVACY_POLICY_SECTIONS.map(({ heading }) => heading),
    )
  })

  it('has English text for its messages', function () {
    for (const key of ['privacyMsg', 'legalLastUpdated']) {
      assert.ok(en[key], `missing ${key}`)
    }
    assert.match(en.legalLastUpdated.message, /\$1/u)
  })

  it('links into the full-screen view', function () {
    assert.equal(getPrivacyPolicyUrl(), 'home.html#/privacy-policy')
  })
})
