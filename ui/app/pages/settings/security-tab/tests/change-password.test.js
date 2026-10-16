import assert from 'assert';
import { mount } from 'enzyme';
import React, { act } from 'react';
import sinon from 'sinon';

import { INCORRECT_PASSWORD_MESSAGE } from '../../../../../../app/scripts/lib/enums';
import ChangePassword from '../change-password';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve, reject };
}

describe('Change password', function () {
  let changePassword;
  let wrapper;

  const field = (id) => wrapper.find(`input#change-password-${id}`);
  const type = (id, value) =>
    field(id).simulate('change', { target: { value } });
  const submitButton = () => wrapper.find('button[type="submit"]');
  const errors = () =>
    wrapper.find('.text-field__helper-text').map((node) => node.text());
  const submit = () => wrapper.find('form').simulate('submit');
  const fill = (current, next, confirm = next) => {
    type('current', current);
    type('new', next);
    type('confirm', confirm);
  };

  beforeEach(function () {
    changePassword = sinon.stub();
    wrapper = mount(<ChangePassword changePassword={changePassword} />, {
      context: { t: (key) => key },
    });
  });

  it('is disabled until the form is filled in', function () {
    assert.equal(submitButton().prop('disabled'), true);
    fill('old-password', 'new-password');
    assert.equal(submitButton().prop('disabled'), false);
    assert.deepEqual(errors(), []);
  });

  it('flags a short new password, a mismatch, and reuse of the current password', function () {
    fill('old-password', 'short', 'shorter');
    assert.deepEqual(errors(), ['passwordNotLongEnough', 'passwordsDontMatch']);
    assert.equal(submitButton().prop('disabled'), true);

    fill('old-password', 'old-password');
    assert.deepEqual(errors(), ['newPasswordSameAsCurrent']);
    assert.equal(submitButton().prop('disabled'), true);

    submit();
    assert.equal(changePassword.called, false);
  });

  it('changes the password, disabling the form while pending, then clears it', async function () {
    const pending = deferred();
    changePassword.returns(pending.promise);
    fill('old-password', 'new-password');
    submit();
    assert(
      changePassword.calledOnceWithExactly('old-password', 'new-password'),
    );
    wrapper.update();
    assert.equal(submitButton().prop('disabled'), true);
    assert.equal(field('current').prop('disabled'), true);

    submit();
    assert(changePassword.calledOnce, 'a second submit is ignored');

    await act(async () => pending.resolve());
    wrapper.update();
    assert.equal(field('current').prop('value'), '');
    assert.equal(field('new').prop('value'), '');
    assert.equal(field('confirm').prop('value'), '');
    assert.equal(wrapper.find('[role="status"]').text(), 'passwordChanged');
    assert.equal(submitButton().prop('disabled'), true);
  });

  it('reports a wrong current password on that field and keeps the input', async function () {
    const pending = deferred();
    changePassword.returns(pending.promise);
    fill('wrong-password', 'new-password');
    submit();
    await act(async () =>
      pending.reject(new Error(INCORRECT_PASSWORD_MESSAGE)),
    );
    wrapper.update();
    assert.deepEqual(errors(), ['incorrectPassword']);
    assert.equal(field('new').prop('value'), 'new-password');
    assert.equal(wrapper.find('[role="status"]').length, 0);

    type('current', 'old-password');
    assert.deepEqual(errors(), []);
  });
});
