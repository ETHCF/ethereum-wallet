import { act, fireEvent, render } from '@testing-library/react';
import assert from 'assert';
import PropTypes from 'prop-types';
import React, { useState } from 'react';

import { ConnectHardwareForm } from '..';
import { LegacyI18nProvider } from '../../../../contexts/i18n';

const address = '0x8bf854d5c79e9d31d56a8feebbf3d11439f04988';

// Stands in for the store: the alert and the account tracker both update the
// form's props while the first page of accounts is being set.
function Harness({ connectHardware, ...props }) {
  const [accounts, setAccounts] = useState({});
  return (
    <LegacyI18nProvider>
      <ConnectHardwareForm
        connectHardware={connectHardware}
        checkHardwareStatus={async () => false}
        showAlert={() => setAccounts({ [address]: { balance: '0x0' } })}
        hideAlert={() => undefined}
        accounts={accounts}
        identities={{}}
        defaultHdPaths={{
          trezor: "m/44'/60'/0'/0",
          ledger: "m/44'/60'/0'/0/0",
        }}
        network="1"
        mostRecentOverviewPage="/"
        navigate={() => undefined}
        {...props}
      />
    </LegacyI18nProvider>
  );
}

Harness.propTypes = { connectHardware: PropTypes.func.isRequired };

describe('ConnectHardwareForm', function () {
  it('lists the accounts from the first connection when the store updates at the same time', async function () {
    const page = Array.from({ length: 5 }, (_, index) => ({
      address: index ? `0x${String(index).repeat(40)}` : address,
      balance: null,
      index,
    }));
    const { container } = render(
      <Harness connectHardware={async () => page} />,
    );
    fireEvent.click(
      container.querySelector('[aria-label="Trezor"]').closest('button'),
    );
    await act(async () => {
      fireEvent.click(container.querySelector('.hw-connect__connect-btn'));
    });
    assert.equal(
      container.querySelectorAll('.hw-account-list__item').length,
      5,
    );
  });

  describe('selecting accounts', function () {
    const page = (offset) =>
      Array.from({ length: 5 }, (_, i) => ({
        address: `0x${String(offset + i).padStart(40, '0')}`,
        balance: null,
        index: offset + i,
      }));
    const connectHardware = async (_device, pageDelta) =>
      page(pageDelta === 1 ? 5 : 0);

    async function open(props) {
      const utils = render(
        <Harness connectHardware={connectHardware} {...props} />,
      );
      const { container } = utils;
      fireEvent.click(
        container.querySelector('[aria-label="Trezor"]').closest('button'),
      );
      await act(async () => {
        fireEvent.click(container.querySelector('.hw-connect__connect-btn'));
      });
      return utils;
    }

    const checkbox = (container, idx) =>
      container.querySelector(`#address-${idx}`);
    const unlockButton = (container) =>
      container.querySelector('.new-external-account-form__button.unlock');

    it('unlocks every checked account in order, then leaves the page', async function () {
      const calls = [];
      let navigated = false;
      const { container } = await open({
        unlockHardwareWalletAccount: async (index, device) => {
          calls.push([index, device]);
        },
        navigate: () => {
          navigated = true;
        },
      });
      assert.equal(checkbox(container, 0).type, 'checkbox');
      fireEvent.click(checkbox(container, 3));
      fireEvent.click(checkbox(container, 1));
      await act(async () => {
        fireEvent.click(unlockButton(container));
      });
      assert.deepEqual(calls, [
        [1, 'trezor'],
        [3, 'trezor'],
      ]);
      assert.equal(navigated, true);
    });

    it('unchecking an account removes it from the selection', async function () {
      const calls = [];
      const { container } = await open({
        unlockHardwareWalletAccount: async (index) => {
          calls.push(index);
        },
      });
      fireEvent.click(checkbox(container, 0));
      fireEvent.click(checkbox(container, 2));
      fireEvent.click(checkbox(container, 0));
      await act(async () => {
        fireEvent.click(unlockButton(container));
      });
      assert.deepEqual(calls, [2]);
    });

    it('keeps selections across pages', async function () {
      const calls = [];
      const { container } = await open({
        unlockHardwareWalletAccount: async (index) => {
          calls.push(index);
        },
      });
      fireEvent.click(checkbox(container, 1));
      await act(async () => {
        fireEvent.click(
          container.querySelectorAll('.hw-list-pagination__button')[1],
        );
      });
      fireEvent.click(checkbox(container, 2));
      await act(async () => {
        fireEvent.click(unlockButton(container));
      });
      assert.deepEqual(calls, [1, 7]);
    });

    it('shows already imported accounts as checked and does not import them again', async function () {
      const calls = [];
      const imported = page(0)[2].address;
      const { container } = await open({
        identities: { [imported]: { address: imported } },
        unlockHardwareWalletAccount: async (index) => {
          calls.push(index);
        },
      });
      assert.equal(checkbox(container, 2).checked, true);
      assert.equal(checkbox(container, 2).disabled, true);
      fireEvent.click(checkbox(container, 4));
      await act(async () => {
        fireEvent.click(unlockButton(container));
      });
      assert.deepEqual(calls, [4]);
    });

    it('disables unlock until an account is checked', async function () {
      const { container } = await open();
      assert.equal(unlockButton(container).disabled, true);
      fireEvent.click(checkbox(container, 0));
      assert.equal(unlockButton(container).disabled, false);
    });

    it('stops at the first failure and stays on the page', async function () {
      const calls = [];
      let navigated = false;
      const { container, findByText } = await open({
        unlockHardwareWalletAccount: async (index) => {
          calls.push(index);
          if (index === 1) {
            throw new Error('Device disconnected');
          }
        },
        navigate: () => {
          navigated = true;
        },
      });
      for (const idx of [0, 1, 2]) {
        fireEvent.click(checkbox(container, idx));
      }
      await act(async () => {
        fireEvent.click(unlockButton(container));
      });
      assert.deepEqual(calls, [0, 1]);
      assert.equal(navigated, false);
      assert.ok(await findByText('Device disconnected'));
    });
  });
});
