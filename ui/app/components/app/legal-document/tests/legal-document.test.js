import assert from 'assert';
import { mount } from 'enzyme';
import React from 'react';

import LegalDocument from '..';
import en from '../../../../../../app/_locales/en/messages.json';
import {
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
} from '../../../../helpers/constants/privacy-policy';
import {
  TERMS_OF_USE_LAST_UPDATED,
  TERMS_OF_USE_SECTIONS,
} from '../../../../helpers/constants/terms-of-use';

const DOCUMENTS = [
  {
    name: 'Privacy Policy',
    titleKey: 'privacyMsg',
    lastUpdated: PRIVACY_POLICY_LAST_UPDATED,
    sections: PRIVACY_POLICY_SECTIONS,
  },
  {
    name: 'Terms of Use',
    titleKey: 'terms',
    lastUpdated: TERMS_OF_USE_LAST_UPDATED,
    sections: TERMS_OF_USE_SECTIONS,
  },
];

describe('LegalDocument', function () {
  for (const { name, titleKey, lastUpdated, sections } of DOCUMENTS) {
    it(`renders every ${name} section`, function () {
      const wrapper = mount(
        <LegalDocument
          title={name}
          lastUpdated={lastUpdated}
          sections={sections}
        />,
      );
      assert.equal(wrapper.find('.legal-document__title').text(), name);
      assert.equal(
        wrapper.find('.legal-document__updated').text(),
        '[legalLastUpdated]',
      );
      assert.deepEqual(
        wrapper
          .find('.legal-document__heading')
          .map((heading) => heading.text()),
        sections.map(({ heading }) => heading),
      );
    });

    it(`has English text for the ${name} title`, function () {
      assert.ok(en[titleKey], `missing ${titleKey}`);
    });
  }

  it('has English text for the last updated message', function () {
    assert.ok(en.legalLastUpdated, 'missing legalLastUpdated');
    assert.match(en.legalLastUpdated.message, /\$1/u);
  });
});
