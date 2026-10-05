import assert from 'assert';
import { mount } from 'enzyme';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import PrivacyPolicy from '..';
import en from '../../../../../app/_locales/en/messages.json';
import { PRIVACY_POLICY_SECTIONS } from '../../../helpers/constants/privacy-policy';
import { ROUTER_FUTURE_FLAGS } from '../../../helpers/constants/router';
import { PRIVACY_POLICY_ROUTE } from '../../../helpers/constants/routes';

describe('Privacy Policy page', function () {
  it('renders every section', function () {
    const wrapper = mount(
      <MemoryRouter
        initialEntries={[PRIVACY_POLICY_ROUTE]}
        future={ROUTER_FUTURE_FLAGS}
      >
        <Routes>
          <Route path={PRIVACY_POLICY_ROUTE} element={<PrivacyPolicy />} />
        </Routes>
      </MemoryRouter>,
    );
    assert.equal(wrapper.find('.legal-document__title').text(), '[privacyMsg]');
    assert.equal(
      wrapper.find('.legal-document__updated').text(),
      '[legalLastUpdated]',
    );
    assert.deepEqual(
      wrapper.find('.legal-document__heading').map((heading) => heading.text()),
      PRIVACY_POLICY_SECTIONS.map(({ heading }) => heading),
    );
  });

  it('has English text for its messages', function () {
    for (const key of ['privacyMsg', 'legalLastUpdated']) {
      assert.ok(en[key], `missing ${key}`);
    }
    assert.match(en.legalLastUpdated.message, /\$1/u);
  });
});
