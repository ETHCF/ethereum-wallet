function countEntries(value) {
  return value && typeof value === 'object' ? Object.keys(value).length : 0;
}

/**
 * Builds shareable diagnostics without copying wallet state or request data.
 * New state fields are excluded unless explicitly added here. Keep each value
 * a derived count, a boolean, or a validated identifier; never include secrets,
 * addresses, URLs, free-form text, or nested state objects.
 *
 * @param {object} state - The Redux state.
 * @returns {object} A detached diagnostic summary.
 */
export function getDiagnosticState(state) {
  const { ecfWallet = {}, appState = {} } = state;
  const { currentLocale } = ecfWallet;
  const chainId = ecfWallet.provider?.chainId;
  return {
    ecfWallet: {
      isInitialized: ecfWallet.isInitialized === true,
      isUnlocked: ecfWallet.isUnlocked === true,
      completedOnboarding: ecfWallet.completedOnboarding === true,
      chainId:
        typeof chainId === 'string' && /^0x[0-9a-f]{1,16}$/iu.test(chainId)
          ? chainId
          : undefined,
      currentLocale:
        typeof currentLocale === 'string' &&
        /^[a-z]{2,3}(?:[-_][a-z]{2,4})?$/iu.test(currentLocale)
          ? currentLocale
          : undefined,
      accountCount: countEntries(ecfWallet.identities),
      transactionCount: countEntries(ecfWallet.currentNetworkTxList),
      pendingTransactionCount: countEntries(ecfWallet.unapprovedTxs),
      pendingPersonalMessageCount: countEntries(
        ecfWallet.unapprovedPersonalMsgs,
      ),
      pendingTypedMessageCount: countEntries(ecfWallet.unapprovedTypedMessages),
    },
    appState: {
      isLoading: appState.isLoading === true,
      gasIsLoading: appState.gasIsLoading === true,
      modalOpen: appState.modal?.open === true,
      sidebarOpen: appState.sidebar?.isOpen === true,
      networkDropdownOpen: appState.networkDropdownOpen === true,
      hasWarning: Boolean(appState.warning),
    },
  };
}
