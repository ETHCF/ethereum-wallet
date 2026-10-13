import assert from 'assert';
import { mount } from 'enzyme';
import React from 'react';
import sinon from 'sinon';

import NetworkForm from '../network-form.component';

describe('NetworkForm', function () {
  const mountForm = (props = {}) => {
    const setRpcTarget = sinon.spy();
    const wrapper = mount(
      <NetworkForm
        editRpc={sinon.spy()}
        showConfirmDeleteNetworkModal={sinon.spy()}
        onClear={sinon.spy()}
        setRpcTarget={setRpcTarget}
        rpcUrls={[]}
        networksTabIsInAddMode
        {...props}
      />,
      { context: { t: (key) => key } },
    );
    return { wrapper, setRpcTarget };
  };

  const type = (wrapper, id, value) =>
    wrapper.find(`input#${id}`).simulate('change', { target: { value } });
  const saveButton = (wrapper) => wrapper.find('Button').last();
  const confirmBox = (wrapper) =>
    wrapper.find('[data-testid="network-form-local-confirm"]');

  it('adds http://localhost:8545 only once the user confirms it', function () {
    const { wrapper, setRpcTarget } = mountForm();
    type(wrapper, 'rpc-url', 'http://localhost:8545');
    type(wrapper, 'chainId', '0x539');

    assert.equal(confirmBox(wrapper).length, 1);
    assert.equal(saveButton(wrapper).prop('disabled'), true);
    wrapper.instance().onSubmit();
    assert.equal(setRpcTarget.called, false);

    confirmBox(wrapper).simulate('change', { target: { checked: true } });
    assert.equal(saveButton(wrapper).prop('disabled'), false);
    saveButton(wrapper).simulate('click');
    assert.equal(setRpcTarget.firstCall.args[0], 'http://localhost:8545');
  });

  it('asks again after the RPC URL changes', function () {
    const { wrapper } = mountForm();
    type(wrapper, 'rpc-url', 'http://localhost:8545');
    type(wrapper, 'chainId', '0x539');
    confirmBox(wrapper).simulate('change', { target: { checked: true } });
    type(wrapper, 'rpc-url', 'http://127.0.0.1:8545');
    assert.equal(confirmBox(wrapper).prop('checked'), false);
    assert.equal(saveButton(wrapper).prop('disabled'), true);
  });

  it('does not ask about remote networks', function () {
    const { wrapper } = mountForm();
    type(wrapper, 'rpc-url', 'https://rpc.example');
    type(wrapper, 'chainId', '0x89');
    assert.equal(confirmBox(wrapper).length, 0);
    assert.equal(saveButton(wrapper).prop('disabled'), false);
  });

  it('does not ask again when editing a saved local network', function () {
    const { wrapper } = mountForm({
      networksTabIsInAddMode: false,
      rpcUrl: 'http://localhost:8545',
      chainId: '0x539',
      networkName: 'Local',
    });
    type(wrapper, 'network-name', 'Local node');
    assert.equal(confirmBox(wrapper).length, 0);
    assert.equal(saveButton(wrapper).prop('disabled'), false);
  });
});
