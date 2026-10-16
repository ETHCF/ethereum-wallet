import assert from 'assert';
import { mount } from 'enzyme';
import PropTypes from 'prop-types';
import React from 'react';

import en from '../../../../../../app/_locales/en/messages.json';
import hu from '../../../../../../app/_locales/hu/messages.json';
import { getMessage } from '../../../../helpers/utils/i18n-helper';
import SelectHardware from '../select-hardware';

function render(messages) {
  return mount(
    <SelectHardware
      connectToHardwareWallet={() => undefined}
      browserSupported
    />,
    {
      context: {
        t: (key, ...args) =>
          getMessage('xx', messages, key, ...args) ||
          getMessage('en', en, key, ...args),
      },
      childContextTypes: { t: PropTypes.func },
    },
  );
}

describe('SelectHardware', function () {
  // Hungarian once translated the brand names, so the links went missing.
  for (const [name, messages] of [
    ['English', en],
    ['Hungarian', hu],
  ]) {
    it(`links to both hardware wallet stores in ${name}`, function () {
      const wrapper = render(messages);
      const links = wrapper.find('.hw-connect__get-hw__msg a');
      assert.deepEqual(
        links.map((link) => [link.text(), link.prop('href')]),
        [
          ['Trezor', 'https://shop.trezor.io/'],
          ['Ledger', 'https://shop.ledger.com/'],
        ],
      );
      for (const link of links) {
        assert.equal(link.props.rel, 'noopener noreferrer');
      }
      assert.equal(
        wrapper.find('[dangerouslySetInnerHTML]').length,
        0,
        'renders no raw HTML',
      );
    });
  }
});
