import assert from 'assert'
import React from 'react'
import { mount } from 'enzyme'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import en from '../../../../../app/_locales/en/messages.json'
import {
  TERMS_OF_USE_SECTIONS,
  getTermsOfUseUrl,
} from '../../../helpers/constants/terms-of-use'
import { TERMS_OF_USE_ROUTE } from '../../../helpers/constants/routes'
import TermsOfUse from '..'
import { ROUTER_FUTURE_FLAGS } from '../../../helpers/constants/router'

describe('Terms of Use page', function () {
  it('renders every section', function () {
    const wrapper = mount(
      <MemoryRouter initialEntries={[TERMS_OF_USE_ROUTE]} future={ROUTER_FUTURE_FLAGS}>
        <Routes>
          <Route path={TERMS_OF_USE_ROUTE} element={<TermsOfUse />} />
        </Routes>
      </MemoryRouter>,
    )
    assert.equal(wrapper.find('.terms-of-use__title').text(), '[terms]')
    assert.deepEqual(
      wrapper.find('.terms-of-use__heading').map((heading) => heading.text()),
      TERMS_OF_USE_SECTIONS.map(({ heading }) => heading),
    )
  })

  it('has English text for its messages', function () {
    for (const key of ['terms', 'termsOfUseLastUpdated']) {
      assert.ok(en[key], `missing ${key}`)
    }
  })

  it('links into the full-screen view', function () {
    assert.equal(getTermsOfUseUrl(), 'home.html#/terms-of-use')
  })
})
