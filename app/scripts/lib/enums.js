const ENVIRONMENT_TYPE_POPUP = 'popup';
const ENVIRONMENT_TYPE_NOTIFICATION = 'notification';
const ENVIRONMENT_TYPE_FULLSCREEN = 'fullscreen';
const ENVIRONMENT_TYPE_BACKGROUND = 'background';

const MESSAGE_TYPE = {
  ETH_DECRYPT: 'eth_decrypt',
  ETH_GET_ENCRYPTION_PUBLIC_KEY: 'eth_getEncryptionPublicKey',
  ETH_SIGN_TYPED_DATA: 'eth_signTypedData',
  PERSONAL_SIGN: 'personal_sign',
};

// The keyring methods the hardware wallet connection tab performs.
const HARDWARE_KEYRING_METHODS = [
  'unlock',
  'addAccounts',
  'getFirstPage',
  'getNextPage',
  'getPreviousPage',
  'signTransaction',
  'signPersonalMessage',
  'signTypedData',
  'exportAccount',
  'forgetDevice',
];

// The background's error for a wrong wallet password, which the UI reports as
// such rather than as a general failure.
const INCORRECT_PASSWORD_MESSAGE = 'Incorrect password.';

export {
  ENVIRONMENT_TYPE_POPUP,
  ENVIRONMENT_TYPE_NOTIFICATION,
  ENVIRONMENT_TYPE_FULLSCREEN,
  ENVIRONMENT_TYPE_BACKGROUND,
  HARDWARE_KEYRING_METHODS,
  INCORRECT_PASSWORD_MESSAGE,
  MESSAGE_TYPE,
};
