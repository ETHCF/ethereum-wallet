// next version number
/*

Removes state that nothing reads any more: the site permissions activity log,
which recorded every permissions-related request a site made, and the
preferences for lost accounts, a forgotten password and the nonce field.

*/

import { cloneDeep } from 'lodash';

const version = 4;

const REMOVED_PREFERENCES = [
  'lostIdentities',
  'forgottenPassword',
  'useNonceField',
];

export default {
  version,

  async migrate(originalVersionedData) {
    const versionedData = cloneDeep(originalVersionedData);
    versionedData.meta.version = version;
    const state = versionedData.data;
    const newState = transformState(state);
    versionedData.data = newState;
    return versionedData;
  },
};

function transformState(state) {
  if (
    state.PermissionsMetadata &&
    typeof state.PermissionsMetadata === 'object'
  ) {
    delete state.PermissionsMetadata.permissionsLog;
  }
  const preferences = state.PreferencesController;
  if (preferences && typeof preferences === 'object') {
    for (const key of REMOVED_PREFERENCES) {
      delete preferences[key];
    }
  }
  return state;
}
