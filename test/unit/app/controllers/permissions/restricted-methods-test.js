import { strict as assert } from 'assert'

import {
  PermissionsController,
} from '../../../../../app/scripts/controllers/permissions'

import {
  grantPermissions,
} from './helpers'

import {
  getters,
  getPermControllerOpts,
  noop,
} from './mocks'

const { ERRORS, PERMS } = getters

const ORIGIN = 'https://foo.xyz'

/**
 * @param {Object} options
 * @param {Object} options.identities - The identities by address.
 * @param {Array<string>} [options.keyringAccounts] - The keyring accounts.
 * @param {Function} [options.getKeyringAccounts] - Overrides keyringAccounts.
 * @returns {PermissionsController} A permissions controller.
 */
const initPermController = ({ identities, keyringAccounts = [], getKeyringAccounts }) => {
  return new PermissionsController({
    ...getPermControllerOpts(),
    getKeyringAccounts: getKeyringAccounts || (async () => [...keyringAccounts]),
    preferences: {
      getState: () => ({ identities, selectedAddress: keyringAccounts[0] }),
      subscribe: noop,
    },
  })
}

const getIdentities = (accounts, getIdentity = () => ({})) => {
  return accounts.reduce((identities, address, index) => {
    identities[address] = { address, ...getIdentity(address, index) }
    return identities
  }, {})
}

const executeEthAccounts = (permController, origin = ORIGIN) => {
  return permController.permissions.executeRestrictedMethod(origin, 'eth_accounts')
}

/**
 * The eth_accounts caveat only returns the primary permitted account, so the
 * full sort order is checked by permitting each suffix of the expected order:
 * the primary account of each suffix must be its first element.
 *
 * @param {PermissionsController} permController - The permissions controller.
 * @param {Array<string>} expectedOrder - The expected sort order.
 */
const assertSortOrder = async (permController, expectedOrder) => {
  for (let i = 0; i < expectedOrder.length; i++) {
    grantPermissions(
      permController, ORIGIN,
      PERMS.grants.eth_accounts(expectedOrder.slice(i)),
    )
    assert.deepEqual(
      await executeEthAccounts(permController),
      [expectedOrder[i]],
      `account ${i} should be in correct position`,
    )
  }
}

describe('restricted methods', function () {

  describe('eth_accounts', function () {

    it('should handle getKeyringAccounts error', async function () {
      const fooError = new Error('foo')
      const permController = initPermController({
        identities: getIdentities(['0x7e57e2']),
        getKeyringAccounts: async () => {
          throw fooError
        },
      })
      grantPermissions(permController, ORIGIN, PERMS.grants.eth_accounts(['0x7e57e2']))

      await assert.rejects(
        executeEthAccounts(permController),
        fooError,
        'Should reject with expected error',
      )

      assert.deepEqual(
        await permController.getAccounts(ORIGIN), [],
        'getAccounts should return no accounts on error',
      )
    })

    it('should handle missing identity for first account when sorting', async function () {
      const permController = initPermController({
        identities: { '0x7e57e2': {} },
        keyringAccounts: ['0x7e57e2', '0x7e57e3'],
      })
      grantPermissions(permController, ORIGIN, PERMS.grants.eth_accounts(['0x7e57e2']))

      await assert.rejects(
        executeEthAccounts(permController),
        { message: 'Missing identity for address 0x7e57e3' },
        'should reject with expected error',
      )
      assert.deepEqual(
        await permController.getAccounts(ORIGIN), [],
        'getAccounts should return no accounts on error',
      )
    })

    it('should handle missing identity for second account when sorting', async function () {
      const permController = initPermController({
        identities: { '0x7e57e3': {} },
        keyringAccounts: ['0x7e57e2', '0x7e57e3'],
      })
      grantPermissions(permController, ORIGIN, PERMS.grants.eth_accounts(['0x7e57e3']))

      await assert.rejects(
        executeEthAccounts(permController),
        { message: 'Missing identity for address 0x7e57e2' },
        'should reject with expected error',
      )
      assert.deepEqual(
        await permController.getAccounts(ORIGIN), [],
        'getAccounts should return no accounts on error',
      )
    })

    it('should return accounts in keyring order when none are selected', async function () {
      const keyringAccounts = ['0x7e57e2', '0x7e57e3', '0x7e57e4', '0x7e57e5']
      const permController = initPermController({
        identities: getIdentities(keyringAccounts),
        keyringAccounts,
      })

      await assertSortOrder(permController, keyringAccounts)
    })

    it('should return accounts in keyring order when all have same last selected time', async function () {
      const keyringAccounts = ['0x7e57e2', '0x7e57e3', '0x7e57e4', '0x7e57e5']
      const permController = initPermController({
        identities: getIdentities(keyringAccounts, () => ({ lastSelected: 1000 })),
        keyringAccounts,
      })

      await assertSortOrder(permController, keyringAccounts)
    })

    it('should return accounts sorted by last selected (descending)', async function () {
      const keyringAccounts = ['0x7e57e2', '0x7e57e3', '0x7e57e4', '0x7e57e5']
      const expectedResult = keyringAccounts.slice().reverse()
      const permController = initPermController({
        identities: getIdentities(keyringAccounts, (_, index) => ({ lastSelected: index * 1000 })),
        keyringAccounts,
      })

      await assertSortOrder(permController, expectedResult)
    })

    it('should return accounts sorted by last selected (descending) with unselected accounts last, in keyring order', async function () {
      const keyringAccounts = ['0x7e57e2', '0x7e57e3', '0x7e57e4', '0x7e57e5', '0x7e57e6']
      const expectedResult = ['0x7e57e4', '0x7e57e2', '0x7e57e3', '0x7e57e5', '0x7e57e6']
      const permController = initPermController({
        identities: {
          '0x7e57e2': { lastSelected: 1000 },
          '0x7e57e3': {},
          '0x7e57e4': { lastSelected: 2000 },
          '0x7e57e5': {},
          '0x7e57e6': {},
        },
        keyringAccounts,
      })

      await assertSortOrder(permController, expectedResult)
    })
  })

  describe('restrictReturnedAccounts caveat', function () {

    const keyringAccounts = ['0x7e57e2', '0x7e57e3', '0x7e57e4', '0x7e57e5']

    let permController

    beforeEach(function () {
      permController = initPermController({
        identities: getIdentities(keyringAccounts, (_, index) => ({ lastSelected: index * 1000 })),
        keyringAccounts,
      })
    })

    it('returns only the primary (most recently selected) permitted account', async function () {
      grantPermissions(
        permController, ORIGIN,
        PERMS.grants.eth_accounts(['0x7e57e2', '0x7e57e3', '0x7e57e4']),
      )

      assert.deepEqual(
        await executeEthAccounts(permController), ['0x7e57e4'],
        'should return only the primary permitted account',
      )
      assert.deepEqual(
        await permController.getAccounts(ORIGIN), ['0x7e57e4'],
        'getAccounts should return only the primary permitted account',
      )
    })

    it('never returns accounts that are not permitted, even if selected more recently', async function () {
      grantPermissions(
        permController, ORIGIN,
        PERMS.grants.eth_accounts(['0x7e57e2', '0x7e57e3']),
      )

      // 0x7e57e5 and 0x7e57e4 were selected more recently
      assert.deepEqual(
        await executeEthAccounts(permController), ['0x7e57e3'],
        'should return the primary permitted account',
      )
    })

    it('returns no accounts if no permitted account is in the keyring', async function () {
      // known identity, but no longer in the keyring
      const identities = getIdentities([...keyringAccounts, '0x7e57e9'])
      permController = initPermController({ identities, keyringAccounts })
      grantPermissions(permController, ORIGIN, PERMS.grants.eth_accounts(['0x7e57e9']))

      assert.deepEqual(
        await executeEthAccounts(permController), [],
        'should return no accounts',
      )
    })

    it('rejects unpermitted origins as unauthorized', async function () {
      await assert.rejects(
        executeEthAccounts(permController, 'https://unknown.origin'),
        ERRORS.permissionController.unauthorized(),
        'should reject with unauthorized error',
      )
      assert.deepEqual(
        await permController.getAccounts('https://unknown.origin'), [],
        'getAccounts should return no accounts',
      )
    })

    it('cannot be granted for accounts without an identity', async function () {
      assert.throws(
        () => grantPermissions(
          permController, ORIGIN, PERMS.grants.eth_accounts(['0x7e57e9']),
        ),
        { message: /Unknown account: 0x7e57e9/u },
        'should throw on unknown account',
      )
      assert.throws(
        () => grantPermissions(permController, ORIGIN, PERMS.grants.eth_accounts([])),
        { message: /Must provide non-empty array of account\(s\)\./u },
        'should throw on empty accounts',
      )
      assert.equal(
        permController.hasPermission(ORIGIN, 'eth_accounts'), false,
        'should not have granted the permission',
      )
    })
  })
})
