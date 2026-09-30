import assert from 'assert'
import sinon from 'sinon'
import { cloneDeep } from 'lodash'
import nock from 'nock'
import ethUtil from 'ethereumjs-util'
import { obj as createThoughStream } from 'through2'
import EthQuery from 'eth-query'
import proxyquire from 'proxyquire'
import firstTimeState from '../../localhostState'
import createTxMeta from '../../../lib/createTxMeta'

const threeBoxSpies = {
  init: sinon.stub(),
  getThreeBoxSyncingState: sinon.stub().returns(true),
  turnThreeBoxSyncingOn: sinon.stub(),
  _registerUpdates: sinon.spy(),
}

class ThreeBoxControllerMock {
  constructor () {
    this.store = {
      subscribe: () => undefined,
      getState: () => ({}),
    }
    this.init = threeBoxSpies.init
    this.getThreeBoxSyncingState = threeBoxSpies.getThreeBoxSyncingState
    this.turnThreeBoxSyncingOn = threeBoxSpies.turnThreeBoxSyncingOn
    this._registerUpdates = threeBoxSpies._registerUpdates
  }
}

const ExtensionizerMock = {
  runtime: {
    id: 'fake-extension-id',
  },
}

let loggerMiddlewareMock
const initializeMockMiddlewareLog = () => {
  loggerMiddlewareMock = {
    requests: [],
    responses: [],
  }
}
const tearDownMockMiddlewareLog = () => {
  loggerMiddlewareMock = undefined
}

const createLoggerMiddlewareMock = () => (req, res, next) => {
  if (loggerMiddlewareMock) {
    loggerMiddlewareMock.requests.push(req)
    next((cb) => {
      loggerMiddlewareMock.responses.push(res)
      cb()
    })
    return
  }
  next()
}

const EcfWalletController = proxyquire('../../../../app/scripts/ecf-wallet-controller', {
  './controllers/threebox': { default: ThreeBoxControllerMock },
  'extensionizer': ExtensionizerMock,
  './lib/createLoggerMiddleware': { default: createLoggerMiddlewareMock },
}).default

const currentNetworkId = '42'
const DEFAULT_LABEL = 'Account 1'
const DEFAULT_LABEL_2 = 'Account 2'
const TEST_SEED = 'debris dizzy just program just float decrease vacant alarm reduce speak stadium'
const TEST_ADDRESS = '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc'
const TEST_ADDRESS_2 = '0xec1adf982415d2ef5ec55899b9bfb8bc0f29251b'
const TEST_ADDRESS_3 = '0xeb9e64b93097bc15f01f13eae97015c57ab64823'
const TEST_SEED_ALT = 'setup olympic issue mobile velvet surge alcohol burger horse view reopen gentle'
const TEST_ADDRESS_ALT = '0xc42edfcc21ed14dda456aa0756c153f7985d8813'
const CUSTOM_RPC_URL = 'http://localhost:8545'

describe('EcfWalletController', function () {
  let ecfWalletController
  const sandbox = sinon.createSandbox()
  const noop = () => undefined

  beforeEach(function () {

    nock('https://api.infura.io')
      .get('/v1/ticker/ethusd')
      .reply(200, '{"base": "ETH", "quote": "USD", "bid": 288.45, "ask": 288.46, "volume": 112888.17569277, "exchange": "bitfinex", "total_volume": 272175.00106721005, "num_exchanges": 8, "timestamp": 1506444677}')

    nock('https://api.infura.io')
      .get('/v1/ticker/ethjpy')
      .reply(200, '{"base": "ETH", "quote": "JPY", "bid": 32300.0, "ask": 32400.0, "volume": 247.4616071, "exchange": "kraken", "total_volume": 247.4616071, "num_exchanges": 1, "timestamp": 1506444676}')

    nock('https://api.infura.io')
      .persist()
      .get(/.*/u)
      .reply(200)

    nock('https://min-api.cryptocompare.com')
      .persist()
      .get(/.*/u)
      .reply(200, '{"JPY":12415.9}')

    ecfWalletController = new EcfWalletController({
      showUnapprovedTx: noop,
      showUnconfirmedMessage: noop,
      encryptor: {
        encrypt (_, object) {
          this.object = object
          return Promise.resolve('mock-encrypted')
        },
        decrypt () {
          return Promise.resolve(this.object)
        },
      },
      initState: cloneDeep(firstTimeState),
      platform: { showTransactionNotification: () => undefined, getVersion: () => 'foo' },
    })
    // add sinon method spies
    sandbox.spy(ecfWalletController.keyringController, 'createNewVaultAndKeychain')
    sandbox.spy(ecfWalletController.keyringController, 'createNewVaultAndRestore')
  })

  afterEach(function () {
    nock.cleanAll()
    sandbox.restore()
  })

  describe('#getAccounts', function () {
    it('returns first address when dapp calls web3.eth.getAccounts', async function () {
      const password = 'a-fake-password'
      await ecfWalletController.createNewVaultAndRestore(password, TEST_SEED)

      ecfWalletController.networkController._baseProviderParams.getAccounts((err, res) => {
        assert.ifError(err)
        assert.equal(res.length, 1)
        assert.equal(res[0], '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc')
      })
    })
  })

  describe('#importAccountWithStrategy', function () {
    const importPrivkey = '4cfd3e90fc78b0f86bf7524722150bb8da9c60cd532564d7ff43f5716514f553'

    beforeEach(async function () {
      const password = 'a-fake-password'
      await ecfWalletController.createNewVaultAndRestore(password, TEST_SEED)
      await ecfWalletController.importAccountWithStrategy('Private Key', [importPrivkey])
    })

    it('adds private key to keyrings in KeyringController', async function () {
      const simpleKeyrings = ecfWalletController.keyringController.getKeyringsByType('Simple Key Pair')
      const privKeyBuffer = simpleKeyrings[0].wallets[0].getPrivateKey()
      const pubKeyBuffer = simpleKeyrings[0].wallets[0].getPublicKey()
      const addressBuffer = ethUtil.pubToAddress(pubKeyBuffer)
      const privKey = ethUtil.bufferToHex(privKeyBuffer)
      const pubKey = ethUtil.bufferToHex(addressBuffer)
      assert.equal(privKey, ethUtil.addHexPrefix(importPrivkey))
      assert.equal(pubKey, '0xe18035bf8712672935fdb4e5e431b1a0183d2dfc')
    })

    it('adds 1 account', async function () {
      const keyringAccounts = await ecfWalletController.keyringController.getAccounts()
      assert.equal(keyringAccounts[keyringAccounts.length - 1], '0xe18035bf8712672935fdb4e5e431b1a0183d2dfc')
    })
  })

  describe('submitPassword', function () {
    const password = 'password'

    beforeEach(async function () {
      await ecfWalletController.createNewVaultAndKeychain(password)
      threeBoxSpies.init.reset()
      threeBoxSpies.turnThreeBoxSyncingOn.reset()
    })

    it('removes any identities that do not correspond to known accounts.', async function () {
      const fakeAddress = '0xbad0'
      ecfWalletController.preferencesController.addAddresses([fakeAddress])
      await ecfWalletController.submitPassword(password)

      const identities = Object.keys(ecfWalletController.preferencesController.store.getState().identities)
      const addresses = await ecfWalletController.keyringController.getAccounts()

      identities.forEach((identity) => {
        assert.ok(addresses.includes(identity), `addresses should include all IDs: ${identity}`)
      })

      addresses.forEach((address) => {
        assert.ok(identities.includes(address), `identities should include all Addresses: ${address}`)
      })
    })

    it('gets the address from threebox and creates a new 3box instance', async function () {
      await ecfWalletController.submitPassword(password)
      assert(threeBoxSpies.init.calledOnce)
      assert(threeBoxSpies.turnThreeBoxSyncingOn.calledOnce)
    })
  })

  describe('#createNewVaultAndKeychain', function () {
    it('can only create new vault on keyringController once', async function () {
      const selectStub = sandbox.stub(ecfWalletController, 'selectFirstIdentity')

      const password = 'a-fake-password'

      await ecfWalletController.createNewVaultAndKeychain(password)
      await ecfWalletController.createNewVaultAndKeychain(password)

      assert(ecfWalletController.keyringController.createNewVaultAndKeychain.calledOnce)

      selectStub.reset()
    })
  })

  describe('#createNewVaultAndRestore', function () {
    it('should be able to call newVaultAndRestore despite a mistake.', async function () {
      const password = 'what-what-what'
      sandbox.stub(ecfWalletController, 'getBalance')
      ecfWalletController.getBalance.callsFake(() => {
        return Promise.resolve('0x0')
      })

      await ecfWalletController.createNewVaultAndRestore(password, TEST_SEED.slice(0, -1)).catch(() => null)
      await ecfWalletController.createNewVaultAndRestore(password, TEST_SEED)

      assert(ecfWalletController.keyringController.createNewVaultAndRestore.calledTwice)
    })

    it('should clear previous identities after vault restoration', async function () {
      sandbox.stub(ecfWalletController, 'getBalance')
      ecfWalletController.getBalance.callsFake(() => {
        return Promise.resolve('0x0')
      })

      let startTime = Date.now()
      await ecfWalletController.createNewVaultAndRestore('foobar1337', TEST_SEED)
      let endTime = Date.now()

      const firstVaultIdentities = cloneDeep(ecfWalletController.getState().identities)
      assert.ok(
        (
          firstVaultIdentities[TEST_ADDRESS].lastSelected >= startTime &&
          firstVaultIdentities[TEST_ADDRESS].lastSelected <= endTime
        ),
        `'${firstVaultIdentities[TEST_ADDRESS].lastSelected}' expected to be between '${startTime}' and '${endTime}'`,
      )
      delete firstVaultIdentities[TEST_ADDRESS].lastSelected
      assert.deepEqual(firstVaultIdentities, {
        [TEST_ADDRESS]: { address: TEST_ADDRESS, name: DEFAULT_LABEL },
      })

      await ecfWalletController.preferencesController.setAccountLabel(TEST_ADDRESS, 'Account Foo')

      const labelledFirstVaultIdentities = cloneDeep(ecfWalletController.getState().identities)
      delete labelledFirstVaultIdentities[TEST_ADDRESS].lastSelected
      assert.deepEqual(labelledFirstVaultIdentities, {
        [TEST_ADDRESS]: { address: TEST_ADDRESS, name: 'Account Foo' },
      })

      startTime = Date.now()
      await ecfWalletController.createNewVaultAndRestore('foobar1337', TEST_SEED_ALT)
      endTime = Date.now()

      const secondVaultIdentities = cloneDeep(ecfWalletController.getState().identities)
      assert.ok(
        (
          secondVaultIdentities[TEST_ADDRESS_ALT].lastSelected >= startTime &&
          secondVaultIdentities[TEST_ADDRESS_ALT].lastSelected <= endTime
        ),
        `'${secondVaultIdentities[TEST_ADDRESS_ALT].lastSelected}' expected to be between '${startTime}' and '${endTime}'`,
      )
      delete secondVaultIdentities[TEST_ADDRESS_ALT].lastSelected
      assert.deepEqual(secondVaultIdentities, {
        [TEST_ADDRESS_ALT]: { address: TEST_ADDRESS_ALT, name: DEFAULT_LABEL },
      })
    })

    it('should restore any consecutive accounts with balances', async function () {
      sandbox.stub(ecfWalletController, 'getBalance')
      ecfWalletController.getBalance.withArgs(TEST_ADDRESS).callsFake(() => {
        return Promise.resolve('0x14ced5122ce0a000')
      })
      ecfWalletController.getBalance.withArgs(TEST_ADDRESS_2).callsFake(() => {
        return Promise.resolve('0x0')
      })
      ecfWalletController.getBalance.withArgs(TEST_ADDRESS_3).callsFake(() => {
        return Promise.resolve('0x14ced5122ce0a000')
      })

      const startTime = Date.now()
      await ecfWalletController.createNewVaultAndRestore('foobar1337', TEST_SEED)

      const identities = cloneDeep(ecfWalletController.getState().identities)
      assert.ok(identities[TEST_ADDRESS].lastSelected >= startTime && identities[TEST_ADDRESS].lastSelected <= Date.now())
      delete identities[TEST_ADDRESS].lastSelected
      assert.deepEqual(identities, {
        [TEST_ADDRESS]: { address: TEST_ADDRESS, name: DEFAULT_LABEL },
        [TEST_ADDRESS_2]: { address: TEST_ADDRESS_2, name: DEFAULT_LABEL_2 },
      })
    })
  })

  describe('#getBalance', function () {
    it('should return the balance known by accountTracker', async function () {
      const accounts = {}
      const balance = '0x14ced5122ce0a000'
      accounts[TEST_ADDRESS] = { balance }

      ecfWalletController.accountTracker.store.putState({ accounts })

      const gotten = await ecfWalletController.getBalance(TEST_ADDRESS)

      assert.equal(balance, gotten)
    })

    it('should ask the network for a balance when not known by accountTracker', async function () {
      const accounts = {}
      const balance = '0x14ced5122ce0a000'
      const ethQuery = new EthQuery()
      sinon.stub(ethQuery, 'getBalance').callsFake((_, callback) => {
        callback(undefined, balance)
      })

      ecfWalletController.accountTracker.store.putState({ accounts })

      const gotten = await ecfWalletController.getBalance(TEST_ADDRESS, ethQuery)

      assert.equal(balance, gotten)
    })
  })

  describe('#getApi', function () {
    it('getState', function (done) {
      let state
      const getApi = ecfWalletController.getApi()
      getApi.getState((err, res) => {
        if (err) {
          done(err)
        } else {
          state = res
        }
      })
      assert.deepEqual(state, ecfWalletController.getState())
      done()
    })
  })

  describe('preferencesController', function () {

    it('defaults useBlockie to false', function () {
      assert.equal(ecfWalletController.preferencesController.store.getState().useBlockie, false)
    })

    it('setUseBlockie to true', function () {
      ecfWalletController.setUseBlockie(true, noop)
      assert.equal(ecfWalletController.preferencesController.store.getState().useBlockie, true)
    })

  })

  describe('#selectFirstIdentity', function () {
    let identities, address

    beforeEach(function () {
      address = '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc'
      identities = {
        '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc': {
          address,
          'name': 'Account 1',
        },
        '0xc42edfcc21ed14dda456aa0756c153f7985d8813': {
          'address': '0xc42edfcc21ed14dda456aa0756c153f7985d8813',
          'name': 'Account 2',
        },
      }
      ecfWalletController.preferencesController.store.updateState({ identities })
      ecfWalletController.selectFirstIdentity()
    })

    it('changes preferences controller select address', function () {
      const preferenceControllerState = ecfWalletController.preferencesController.store.getState()
      assert.equal(preferenceControllerState.selectedAddress, address)
    })

    it('changes ecf-wallet controller selected address', function () {
      const ecfWalletState = ecfWalletController.getState()
      assert.equal(ecfWalletState.selectedAddress, address)
    })
  })

  describe('connectHardware', function () {

    it('should throw if it receives an unknown device name', async function () {
      try {
        await ecfWalletController.connectHardware('Some random device name', 0, `m/44/0'/0'`)
      } catch (e) {
        assert.equal(e, 'Error: EcfWalletController:getKeyringForDevice - Unknown device')
      }
    })

    it('should add the Trezor Hardware keyring', async function () {
      sinon.spy(ecfWalletController.keyringController, 'addNewKeyring')
      await ecfWalletController.connectHardware('trezor', 0).catch(() => null)
      const keyrings = await ecfWalletController.keyringController.getKeyringsByType(
        'Trezor Hardware',
      )
      assert.equal(ecfWalletController.keyringController.addNewKeyring.getCall(0).args, 'Trezor Hardware')
      assert.equal(keyrings.length, 1)
    })

    it('should add the Ledger Hardware keyring', async function () {
      sinon.spy(ecfWalletController.keyringController, 'addNewKeyring')
      await ecfWalletController.connectHardware('ledger', 0).catch(() => null)
      const keyrings = await ecfWalletController.keyringController.getKeyringsByType(
        'Ledger Hardware',
      )
      assert.equal(ecfWalletController.keyringController.addNewKeyring.getCall(0).args, 'Ledger Hardware')
      assert.equal(keyrings.length, 1)
    })

  })

  describe('checkHardwareStatus', function () {
    it('should throw if it receives an unknown device name', async function () {
      try {
        await ecfWalletController.checkHardwareStatus('Some random device name', `m/44/0'/0'`)
      } catch (e) {
        assert.equal(e, 'Error: EcfWalletController:getKeyringForDevice - Unknown device')
      }
    })

    it('should be locked by default', async function () {
      await ecfWalletController.connectHardware('trezor', 0).catch(() => null)
      const status = await ecfWalletController.checkHardwareStatus('trezor')
      assert.equal(status, false)
    })
  })

  describe('forgetDevice', function () {
    it('should throw if it receives an unknown device name', async function () {
      try {
        await ecfWalletController.forgetDevice('Some random device name')
      } catch (e) {
        assert.equal(e, 'Error: EcfWalletController:getKeyringForDevice - Unknown device')
      }
    })

    it('should wipe all the keyring info', async function () {
      await ecfWalletController.connectHardware('trezor', 0).catch(() => null)
      const keyring = await ecfWalletController.getKeyringForDevice('trezor')
      const call = sinon.stub(keyring, 'call').resolves()
      await ecfWalletController.forgetDevice('trezor')
      assert.equal(call.calledWithExactly('forgetDevice', []), true)
      const keyrings = await ecfWalletController.keyringController.getKeyringsByType(
        'Trezor Hardware',
      )

      assert.deepEqual(await keyrings[0].getAccounts(), [])
      assert.deepEqual(await keyrings[0].serialize(), { accounts: [] })
      assert.deepEqual(keyrings[0].isUnlocked(), false)
    })
  })

  describe('unlockHardwareWalletAccount', function () {
    let accountToUnlock
    let windowOpenStub
    let addNewAccountStub
    let getAccountsStub
    beforeEach(async function () {
      accountToUnlock = 10
      windowOpenStub = sinon.stub(window, 'open')
      windowOpenStub.returns(noop)

      addNewAccountStub = sinon.stub(ecfWalletController.keyringController, 'addNewAccount')
      addNewAccountStub.returns({})

      getAccountsStub = sinon.stub(ecfWalletController.keyringController, 'getAccounts')
      // Need to return different address to mock the behavior of
      // adding a new account from the keyring
      getAccountsStub.onCall(0).returns(Promise.resolve(['0x1']))
      getAccountsStub.onCall(1).returns(Promise.resolve(['0x2']))
      getAccountsStub.onCall(2).returns(Promise.resolve(['0x3']))
      getAccountsStub.onCall(3).returns(Promise.resolve(['0x4']))
      sinon.spy(ecfWalletController.preferencesController, 'setAddresses')
      sinon.spy(ecfWalletController.preferencesController, 'setSelectedAddress')
      sinon.spy(ecfWalletController.preferencesController, 'setAccountLabel')
      await ecfWalletController.connectHardware('trezor', 0, `m/44/0'/0'`).catch(() => null)
      await ecfWalletController.unlockHardwareWalletAccount(accountToUnlock, 'trezor', `m/44/0'/0'`)
    })

    afterEach(function () {
      window.open.restore()
      ecfWalletController.keyringController.addNewAccount.restore()
      ecfWalletController.keyringController.getAccounts.restore()
      ecfWalletController.preferencesController.setAddresses.restore()
      ecfWalletController.preferencesController.setSelectedAddress.restore()
      ecfWalletController.preferencesController.setAccountLabel.restore()
    })

    it('should set unlockedAccount in the keyring', async function () {
      const keyrings = await ecfWalletController.keyringController.getKeyringsByType(
        'Trezor Hardware',
      )
      assert.equal((await keyrings[0].serialize()).unlockedAccount, accountToUnlock)
    })

    it('should call keyringController.addNewAccount', async function () {
      assert(ecfWalletController.keyringController.addNewAccount.calledOnce)
    })

    it('should call keyringController.getAccounts ', async function () {
      assert(ecfWalletController.keyringController.getAccounts.called)
    })

    it('should call preferencesController.setAddresses', async function () {
      assert(ecfWalletController.preferencesController.setAddresses.calledOnce)
    })

    it('should call preferencesController.setSelectedAddress', async function () {
      assert(ecfWalletController.preferencesController.setSelectedAddress.calledOnce)
    })

    it('should call preferencesController.setAccountLabel', async function () {
      assert(ecfWalletController.preferencesController.setAccountLabel.calledOnce)
    })

  })

  describe('#setCustomRpc', function () {
    let rpcTarget

    beforeEach(function () {
      rpcTarget = ecfWalletController.setCustomRpc(CUSTOM_RPC_URL)
    })

    it('returns custom RPC that when called', async function () {
      assert.equal(await rpcTarget, CUSTOM_RPC_URL)
    })

    it('changes the network controller rpc', function () {
      const networkControllerState = ecfWalletController.networkController.store.getState()
      assert.equal(networkControllerState.provider.rpcTarget, CUSTOM_RPC_URL)
    })
  })

  describe('#setCurrentCurrency', function () {
    let defaultEcfWalletCurrency

    beforeEach(function () {
      defaultEcfWalletCurrency = ecfWalletController.currencyRateController.state.currentCurrency
    })

    it('defaults to usd', function () {
      assert.equal(defaultEcfWalletCurrency, 'usd')
    })

    it('sets currency to JPY', function () {
      ecfWalletController.setCurrentCurrency('JPY', noop)
      assert.equal(ecfWalletController.currencyRateController.state.currentCurrency, 'JPY')
    })
  })

  describe('#addNewAccount', function () {
    it('errors when an primary keyring is does not exist', async function () {
      const addNewAccount = ecfWalletController.addNewAccount()

      try {
        await addNewAccount
        assert.fail('should throw')
      } catch (e) {
        assert.equal(e.message, 'EcfWalletController - No HD Key Tree found')
      }
    })
  })

  describe('#verifyseedPhrase', function () {
    it('errors when no keying is provided', async function () {
      try {
        await ecfWalletController.verifySeedPhrase()
      } catch (error) {
        assert.equal(error.message, 'EcfWalletController - No HD Key Tree found')
      }
    })

    beforeEach(async function () {
      await ecfWalletController.createNewVaultAndKeychain('password')
    })

    it('#addNewAccount', async function () {
      await ecfWalletController.addNewAccount()
      const getAccounts = await ecfWalletController.keyringController.getAccounts()
      assert.equal(getAccounts.length, 2)
    })
  })

  describe('#resetAccount', function () {
    it('wipes transactions from only the correct network id and with the selected address', async function () {
      const selectedAddressStub = sinon.stub(ecfWalletController.preferencesController, 'getSelectedAddress')
      const getNetworkstub = sinon.stub(ecfWalletController.txController.txStateManager, 'getNetwork')

      selectedAddressStub.returns('0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc')
      getNetworkstub.returns(42)

      ecfWalletController.txController.txStateManager._saveTxList([
        createTxMeta({ id: 1, status: 'unapproved', ecfWalletNetworkId: currentNetworkId, txParams: { from: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc' } }),
        createTxMeta({ id: 1, status: 'unapproved', ecfWalletNetworkId: currentNetworkId, txParams: { from: '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc' } }),
        createTxMeta({ id: 2, status: 'rejected', ecfWalletNetworkId: '32' }),
        createTxMeta({ id: 3, status: 'submitted', ecfWalletNetworkId: currentNetworkId, txParams: { from: '0xB09d8505E1F4EF1CeA089D47094f5DD3464083d4' } }),
      ])

      await ecfWalletController.resetAccount()
      assert.equal(ecfWalletController.txController.txStateManager.getTx(1), undefined)
    })
  })

  describe('#removeAccount', function () {
    let ret
    const addressToRemove = '0x1'

    beforeEach(async function () {
      sinon.stub(ecfWalletController.preferencesController, 'removeAddress')
      sinon.stub(ecfWalletController.accountTracker, 'removeAccount')
      sinon.stub(ecfWalletController.keyringController, 'removeAccount')
      sinon.stub(ecfWalletController.permissionsController, 'removeAllAccountPermissions')

      ret = await ecfWalletController.removeAccount(addressToRemove)

    })

    afterEach(function () {
      ecfWalletController.keyringController.removeAccount.restore()
      ecfWalletController.accountTracker.removeAccount.restore()
      ecfWalletController.preferencesController.removeAddress.restore()
      ecfWalletController.permissionsController.removeAllAccountPermissions.restore()
    })

    it('should call preferencesController.removeAddress', async function () {
      assert(ecfWalletController.preferencesController.removeAddress.calledWith(addressToRemove))
    })
    it('should call accountTracker.removeAccount', async function () {
      assert(ecfWalletController.accountTracker.removeAccount.calledWith([addressToRemove]))
    })
    it('should call keyringController.removeAccount', async function () {
      assert(ecfWalletController.keyringController.removeAccount.calledWith(addressToRemove))
    })
    it('should call permissionsController.removeAllAccountPermissions', async function () {
      assert(ecfWalletController.permissionsController.removeAllAccountPermissions.calledWith(addressToRemove))
    })
    it('should return address', async function () {
      assert.equal(ret, '0x1')
    })
  })

  describe('#setCurrentLocale', function () {

    it('checks the default currentLocale', function () {
      const preferenceCurrentLocale = ecfWalletController.preferencesController.store.getState().currentLocale
      assert.equal(preferenceCurrentLocale, undefined)
    })

    it('sets current locale in preferences controller', function () {
      ecfWalletController.setCurrentLocale('ja', noop)
      const preferenceCurrentLocale = ecfWalletController.preferencesController.store.getState().currentLocale
      assert.equal(preferenceCurrentLocale, 'ja')
    })

  })

  describe('#newUnsignedMessage', function () {

    let msgParams, ecfWalletMsgs, messages, msgId

    const address = '0xc42edfcc21ed14dda456aa0756c153f7985d8813'
    const data = '0x43727970746f6b697474696573'

    beforeEach(async function () {
      sandbox.stub(ecfWalletController, 'getBalance')
      ecfWalletController.getBalance.callsFake(() => {
        return Promise.resolve('0x0')
      })

      await ecfWalletController.createNewVaultAndRestore('foobar1337', TEST_SEED_ALT)

      msgParams = {
        'from': address,
        data,
      }

      const promise = ecfWalletController.newUnsignedMessage(msgParams)
      // handle the promise so it doesn't throw an unhandledRejection
      promise.then(noop).catch(noop)

      ecfWalletMsgs = ecfWalletController.messageManager.getUnapprovedMsgs()
      messages = ecfWalletController.messageManager.messages
      msgId = Object.keys(ecfWalletMsgs)[0]
      messages[0].msgParams.ecfWalletId = parseInt(msgId, 10)
    })

    it('persists address from msg params', function () {
      assert.equal(ecfWalletMsgs[msgId].msgParams.from, address)
    })

    it('persists data from msg params', function () {
      assert.equal(ecfWalletMsgs[msgId].msgParams.data, data)
    })

    it('sets the status to unapproved', function () {
      assert.equal(ecfWalletMsgs[msgId].status, 'unapproved')
    })

    it('sets the type to eth_sign', function () {
      assert.equal(ecfWalletMsgs[msgId].type, 'eth_sign')
    })

    it('rejects the message', function () {
      const msgIdInt = parseInt(msgId, 10)
      ecfWalletController.cancelMessage(msgIdInt, noop)
      assert.equal(messages[0].status, 'rejected')
    })

    it('errors when signing a message', async function () {
      try {
        await ecfWalletController.signMessage(messages[0].msgParams)
      } catch (error) {
        assert.equal(error.message, 'Expected message to be an Uint8Array with length 32')
      }
    })
  })

  describe('#newUnsignedPersonalMessage', function () {
    let msgParams, ecfWalletPersonalMsgs, personalMessages, msgId

    const address = '0xc42edfcc21ed14dda456aa0756c153f7985d8813'
    const data = '0x43727970746f6b697474696573'

    beforeEach(async function () {
      sandbox.stub(ecfWalletController, 'getBalance')
      ecfWalletController.getBalance.callsFake(() => {
        return Promise.resolve('0x0')
      })

      await ecfWalletController.createNewVaultAndRestore('foobar1337', TEST_SEED_ALT)

      msgParams = {
        'from': address,
        data,
      }

      const promise = ecfWalletController.newUnsignedPersonalMessage(msgParams)
      // handle the promise so it doesn't throw an unhandledRejection
      promise.then(noop).catch(noop)

      ecfWalletPersonalMsgs = ecfWalletController.personalMessageManager.getUnapprovedMsgs()
      personalMessages = ecfWalletController.personalMessageManager.messages
      msgId = Object.keys(ecfWalletPersonalMsgs)[0]
      personalMessages[0].msgParams.ecfWalletId = parseInt(msgId, 10)
    })

    it('errors with no from in msgParams', async function () {
      try {
        await ecfWalletController.newUnsignedPersonalMessage({
          data,
        })
        assert.fail('should have thrown')
      } catch (error) {
        assert.equal(error.message, 'ecf-wallet Message Signature: from field is required.')
      }
    })

    it('persists address from msg params', function () {
      assert.equal(ecfWalletPersonalMsgs[msgId].msgParams.from, address)
    })

    it('persists data from msg params', function () {
      assert.equal(ecfWalletPersonalMsgs[msgId].msgParams.data, data)
    })

    it('sets the status to unapproved', function () {
      assert.equal(ecfWalletPersonalMsgs[msgId].status, 'unapproved')
    })

    it('sets the type to personal_sign', function () {
      assert.equal(ecfWalletPersonalMsgs[msgId].type, 'personal_sign')
    })

    it('rejects the message', function () {
      const msgIdInt = parseInt(msgId, 10)
      ecfWalletController.cancelPersonalMessage(msgIdInt, noop)
      assert.equal(personalMessages[0].status, 'rejected')
    })

    it('errors when signing a message', async function () {
      await ecfWalletController.signPersonalMessage(personalMessages[0].msgParams)
      assert.equal(ecfWalletPersonalMsgs[msgId].status, 'signed')
      assert.equal(ecfWalletPersonalMsgs[msgId].rawSig, '0x6a1b65e2b8ed53cf398a769fad24738f9fbe29841fe6854e226953542c4b6a173473cb152b6b1ae5f06d601d45dd699a129b0a8ca84e78b423031db5baa734741b')
    })
  })

  describe('#setupUntrustedCommunication', function () {

    const mockTxParams = { from: TEST_ADDRESS }

    beforeEach(function () {
      initializeMockMiddlewareLog()
    })

    after(function () {
      tearDownMockMiddlewareLog()
    })

    it('sets up phishing stream for untrusted communication', async function () {
      const phishingMessageSender = {
        url: 'http://myethereumwalletntw.com',
        tab: {},
      }

      const { promise, resolve } = deferredPromise()
      const streamTest = createThoughStream((chunk, _, cb) => {
        if (chunk.name !== 'phishing') {
          cb()
          return
        }
        assert.equal(chunk.data.hostname, (new URL(phishingMessageSender.url)).hostname)
        resolve()
        cb()
      })

      ecfWalletController.setupUntrustedCommunication(streamTest, phishingMessageSender)
      await promise
      streamTest.end()
    })

    it('adds a tabId and origin to requests', function (done) {
      const messageSender = {
        url: 'http://mycrypto.com',
        tab: { id: 456 },
      }
      const streamTest = createThoughStream((chunk, _, cb) => {
        if (chunk.data && chunk.data.method) {
          cb(null, chunk)
          return
        }
        cb()
      })

      ecfWalletController.setupUntrustedCommunication(streamTest, messageSender)

      const message = {
        id: 1999133338649204,
        jsonrpc: '2.0',
        params: [{ ...mockTxParams }],
        method: 'eth_sendTransaction',
      }
      streamTest.write({
        name: 'provider',
        data: message,
      }, null, () => {
        setTimeout(() => {
          assert.deepStrictEqual(
            loggerMiddlewareMock.requests[0],
            {
              ...message,
              origin: 'http://mycrypto.com',
              tabId: 456,
            },
          )
          done()
        })
      })
    })

    it('should add only origin to request if tabId not provided', function (done) {
      const messageSender = {
        url: 'http://mycrypto.com',
      }
      const streamTest = createThoughStream((chunk, _, cb) => {
        if (chunk.data && chunk.data.method) {
          cb(null, chunk)
          return
        }
        cb()
      })

      ecfWalletController.setupUntrustedCommunication(streamTest, messageSender)

      const message = {
        id: 1999133338649204,
        jsonrpc: '2.0',
        params: [{ ...mockTxParams }],
        method: 'eth_sendTransaction',
      }
      streamTest.write({
        name: 'provider',
        data: message,
      }, null, () => {
        setTimeout(() => {
          assert.deepStrictEqual(
            loggerMiddlewareMock.requests[0],
            {
              ...message,
              origin: 'http://mycrypto.com',
            },
          )
          done()
        })
      })
    })
  })

  describe('#setupTrustedCommunication', function () {
    it('sets up controller dnode api for trusted communication', async function () {
      const messageSender = {
        url: 'http://mycrypto.com',
        tab: {},
      }
      const { promise, resolve } = deferredPromise()
      const streamTest = createThoughStream((chunk, _, cb) => {
        assert.equal(chunk.name, 'controller')
        resolve()
        cb()
      })

      ecfWalletController.setupTrustedCommunication(streamTest, messageSender)
      await promise
      streamTest.end()
    })
  })

  describe('#markPasswordForgotten', function () {
    it('adds and sets forgottenPassword to config data to true', function () {
      ecfWalletController.markPasswordForgotten(noop)
      const state = ecfWalletController.getState()
      assert.equal(state.forgottenPassword, true)
    })
  })

  describe('#unMarkPasswordForgotten', function () {
    it('adds and sets forgottenPassword to config data to false', function () {
      ecfWalletController.unMarkPasswordForgotten(noop)
      const state = ecfWalletController.getState()
      assert.equal(state.forgottenPassword, false)
    })
  })

  describe('#_onKeyringControllerUpdate', function () {

    it('should do nothing if there are no keyrings in state', async function () {
      const syncAddresses = sinon.fake()
      const syncWithAddresses = sinon.fake()
      sandbox.replace(ecfWalletController, 'preferencesController', {
        syncAddresses,
      })
      sandbox.replace(ecfWalletController, 'accountTracker', {
        syncWithAddresses,
      })

      const oldState = ecfWalletController.getState()
      await ecfWalletController._onKeyringControllerUpdate({ keyrings: [] })

      assert.ok(syncAddresses.notCalled)
      assert.ok(syncWithAddresses.notCalled)
      assert.deepEqual(ecfWalletController.getState(), oldState)
    })

    it('should sync addresses if there are keyrings in state', async function () {
      const syncAddresses = sinon.fake()
      const syncWithAddresses = sinon.fake()
      sandbox.replace(ecfWalletController, 'preferencesController', {
        syncAddresses,
      })
      sandbox.replace(ecfWalletController, 'accountTracker', {
        syncWithAddresses,
      })

      const oldState = ecfWalletController.getState()
      await ecfWalletController._onKeyringControllerUpdate({
        keyrings: [{
          accounts: ['0x1', '0x2'],
        }],
      })

      assert.deepEqual(syncAddresses.args, [[['0x1', '0x2']]])
      assert.deepEqual(syncWithAddresses.args, [[['0x1', '0x2']]])
      assert.deepEqual(ecfWalletController.getState(), oldState)
    })

    it('should NOT update selected address if already unlocked', async function () {
      const syncAddresses = sinon.fake()
      const syncWithAddresses = sinon.fake()
      sandbox.replace(ecfWalletController, 'preferencesController', {
        syncAddresses,
      })
      sandbox.replace(ecfWalletController, 'accountTracker', {
        syncWithAddresses,
      })

      const oldState = ecfWalletController.getState()
      await ecfWalletController._onKeyringControllerUpdate({
        isUnlocked: true,
        keyrings: [{
          accounts: ['0x1', '0x2'],
        }],
      })

      assert.deepEqual(syncAddresses.args, [[['0x1', '0x2']]])
      assert.deepEqual(syncWithAddresses.args, [[['0x1', '0x2']]])
      assert.deepEqual(ecfWalletController.getState(), oldState)
    })
  })

})

function deferredPromise () {
  let resolve
  const promise = new Promise((_resolve) => {
    resolve = _resolve
  })
  return { promise, resolve }
}
