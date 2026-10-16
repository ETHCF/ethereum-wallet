import { strict as assert } from 'assert';
import deepFreeze from 'deep-freeze-strict';

import { getDiagnosticState } from './diagnostic-state';

describe('getDiagnosticState', function () {
  it('keeps useful status and counts without retaining wallet data', function () {
    const secret = 'SYNTHETIC_SECRET_MUST_NOT_APPEAR';
    const state = deepFreeze({
      ecfWallet: {
        isInitialized: true,
        isUnlocked: true,
        completedOnboarding: true,
        currentLocale: 'pt_BR',
        provider: {
          chainId: '0x1',
          rpcTarget: `https://${secret}@rpc.invalid`,
        },
        identities: { [secret]: { name: secret } },
        currentNetworkTxList: [
          { rawTx: secret },
          { txParams: { data: secret } },
        ],
        unapprovedTxs: { tx: { data: secret } },
        unapprovedPersonalMsgs: { msg: { data: secret } },
        unapprovedTypedMessages: { msg: { data: secret } },
        seedWords: secret,
        vault: secret,
        futureField: { sensitiveData: secret },
      },
      appState: {
        accountDetail: { privateKey: secret },
        modal: { open: true, modalState: { props: { password: secret } } },
        sidebar: { isOpen: false, props: { data: secret } },
        warning: secret,
        isLoading: false,
        gasIsLoading: true,
        networkDropdownOpen: true,
        futureField: secret,
      },
      activeTab: { url: `https://${secret}.invalid` },
      futureRoot: { sensitiveData: secret },
    });
    const diagnostics = getDiagnosticState(state);
    assert.deepEqual(diagnostics, {
      ecfWallet: {
        isInitialized: true,
        isUnlocked: true,
        completedOnboarding: true,
        chainId: '0x1',
        currentLocale: 'pt_BR',
        accountCount: 1,
        transactionCount: 2,
        pendingTransactionCount: 1,
        pendingPersonalMessageCount: 1,
        pendingTypedMessageCount: 1,
      },
      appState: {
        isLoading: false,
        gasIsLoading: true,
        modalOpen: true,
        sidebarOpen: false,
        networkDropdownOpen: true,
        hasWarning: true,
      },
    });
    assert.equal(JSON.stringify(diagnostics).includes(secret), false);
    diagnostics.ecfWallet.isUnlocked = false;
    assert.equal(state.ecfWallet.isUnlocked, true);
  });

  it('does not serialize unexpected objects or free-form values in allowed fields', function () {
    const secret = { privateKey: 'SYNTHETIC_SECRET' };
    const diagnostics = getDiagnosticState({
      ecfWallet: {
        isUnlocked: secret,
        provider: { chainId: secret },
        currentLocale: 'https://credentials@rpc.invalid',
      },
      appState: { isLoading: secret, modal: { open: secret } },
    });
    assert.equal(diagnostics.ecfWallet.isUnlocked, false);
    assert.equal(diagnostics.ecfWallet.chainId, undefined);
    assert.equal(diagnostics.ecfWallet.currentLocale, undefined);
    assert.equal(diagnostics.appState.isLoading, false);
    assert.equal(diagnostics.appState.modalOpen, false);
    assert.equal(
      JSON.stringify(diagnostics).includes('SYNTHETIC_SECRET'),
      false,
    );
    assert.doesNotThrow(() => getDiagnosticState({}));
  });
});
