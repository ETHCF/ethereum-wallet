import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';

import TextField from '../../../components/ui/text-field';
import { UnconnectedRestoreVaultPage as RestoreVaultPage } from '../restore-vault';

const SECRET = {
  spellCheck: false,
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
};

function assertSecretField(field) {
  for (const [name, value] of Object.entries(SECRET)) {
    assert.equal(field.prop(name), value, name);
  }
}

describe('RestoreVaultPage', function () {
  it('masks the seed phrase until asked, and never spell checks or autocompletes it', function () {
    const wrapper = shallow(
      <RestoreVaultPage
        createNewVaultAndRestore={() => undefined}
        navigate={() => undefined}
      />,
      { context: { t: (key) => key } },
    );

    const masked = wrapper.find(TextField).filter('#seed-phrase');
    assert.equal(masked.prop('type'), 'password');
    assertSecretField(masked);
    assert.equal(wrapper.find('textarea').length, 0);

    wrapper.find('.first-time-flow__checkbox-container').simulate('click');
    assert.equal(wrapper.find(TextField).filter('#seed-phrase').length, 0);
    assertSecretField(wrapper.find('textarea'));
  });
});
