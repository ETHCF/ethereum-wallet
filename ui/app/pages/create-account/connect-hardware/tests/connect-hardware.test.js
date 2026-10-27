import { act, fireEvent, render } from '@testing-library/react';
import assert from 'assert';
import PropTypes from 'prop-types';
import React, { useState } from 'react';

import { ConnectHardwareForm } from '..';
import { LegacyI18nProvider } from '../../../../contexts/i18n';

const address = '0x8bf854d5c79e9d31d56a8feebbf3d11439f04988';

// Stands in for the store: the alert and the account tracker both update the
// form's props while the first page of accounts is being set.
function Harness({ connectHardware }) {
  const [accounts, setAccounts] = useState({});
  return (
    <LegacyI18nProvider>
      <ConnectHardwareForm
        connectHardware={connectHardware}
        checkHardwareStatus={async () => false}
        showAlert={() => setAccounts({ [address]: { balance: '0x0' } })}
        hideAlert={() => undefined}
        accounts={accounts}
        defaultHdPaths={{
          trezor: "m/44'/60'/0'/0",
          ledger: "m/44'/60'/0'/0/0",
        }}
        network="1"
        mostRecentOverviewPage="/"
        navigate={() => undefined}
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
});
