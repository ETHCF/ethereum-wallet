import assert from 'assert';
import React from 'react';
import sinon from 'sinon';

import TypedMessageManager from '../../../../../../app/scripts/lib/typed-message-manager';
import * as environment from '../../../../../../app/scripts/lib/util';
import shallow from '../../../../../lib/shallow-with-context';
import Footer from '../signature-request-footer';
import SignatureRequest from '../signature-request.component';

describe('Signature Request Component', function () {
  describe('notification lifecycle', function () {
    let sandbox,
      addedListeners,
      wrapper,
      manager,
      message,
      response,
      cancel,
      clearConfirmTransaction;

    beforeEach(function () {
      sandbox = sinon.createSandbox();
      sandbox.stub(environment, 'getEnvironmentType').returns('notification');
      addedListeners = sandbox.spy(window, 'addEventListener');
    });

    afterEach(function () {
      if (wrapper) {
        wrapper.unmount();
        wrapper = undefined;
      }
      // Clean up even when testing the old implementation, which leaked listeners.
      addedListeners.getCalls().forEach(({ args: [type, listener] }) => {
        window.removeEventListener(type, listener);
      });
      sandbox.restore();
    });

    function createRequest(version = 'V4') {
      manager = new TypedMessageManager({
        networkController: { getChainId: () => '0x1' },
      });
      response = manager
        .addUnapprovedMessageAsync(
          {
            from: '0xc42edfcc21ed14dda456aa0756c153f7985d8813',
            data: {
              types: {
                EIP712Domain: [{ name: 'chainId', type: 'uint256' }],
                Test: [{ name: 'value', type: 'string' }],
              },
              primaryType: 'Test',
              domain: { chainId: 1 },
              message: { value: 'Approve this message' },
            },
          },
          { origin: 'https://app.uniswap.org' },
          version,
        )
        .then(
          (signature) => ({ signature }),
          (error) => ({ error: error.code }),
        );
      message = manager.messages[0];
      cancel = sandbox.spy(() => manager.rejectMsg(message.id));
      clearConfirmTransaction = sandbox.spy();
    }

    function renderRequest(sign = sandbox.spy()) {
      wrapper = shallow(
        <SignatureRequest
          txData={message}
          fromAccount={{ address: message.msgParams.from }}
          clearConfirmTransaction={clearConfirmTransaction}
          cancel={cancel}
          sign={sign}
        />,
      );
    }

    ['V3', 'V4'].forEach((version) => {
      it(`returns the ${version} signature when the popup closes while hardware signing is pending`, async function () {
        createRequest(version);
        let finishSigning;
        const hardwareResult = new Promise((resolve) => {
          finishSigning = resolve;
        });
        renderRequest(async () => {
          await manager.approveMessage({ ecfWalletId: message.id });
          const signature = await hardwareResult;
          manager.setMsgStatusSigned(message.id, signature);
          return signature;
        });

        const signing = wrapper.find(Footer).prop('signAction')(
          new window.Event('click'),
        );
        assert.equal(message.status, 'approved');
        assert.equal(manager.unapprovedTypedMessagesCount, 0);
        window.dispatchEvent(new window.Event('beforeunload'));
        const signature = `0x${'ab'.repeat(65)}`;
        finishSigning(signature);
        await signing;

        assert.deepEqual(await response, { signature });
        sinon.assert.notCalled(cancel);
        sinon.assert.notCalled(clearConfirmTransaction);
      });
    });

    it('rejects an unanswered request when its notification closes', async function () {
      createRequest();
      renderRequest();
      window.dispatchEvent(new window.Event('beforeunload'));
      assert.deepEqual(await response, { error: 4001 });
      sinon.assert.calledOnce(cancel);
      sinon.assert.calledOnce(clearConfirmTransaction);
    });

    it('does not cancel again when the notification closes after Cancel', async function () {
      createRequest();
      renderRequest();
      wrapper.find(Footer).prop('cancelAction')(new window.Event('click'));
      window.dispatchEvent(new window.Event('beforeunload'));
      assert.deepEqual(await response, { error: 4001 });
      sinon.assert.calledOnce(cancel);
    });

    it('removes the previous request close handler on unmount', function () {
      createRequest();
      renderRequest();
      wrapper.unmount();
      wrapper = undefined;
      window.dispatchEvent(new window.Event('beforeunload'));
      sinon.assert.notCalled(cancel);
      sinon.assert.notCalled(clearConfirmTransaction);
    });
  });
});
