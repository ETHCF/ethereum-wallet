import assert from 'assert';
import sinon from 'sinon';

import NetworkController from '../../../app/scripts/controllers/network';
import TypedMessageManager from '../../../app/scripts/lib/typed-message-manager';

describe('Typed Message Manager', function () {
  let typedMessageManager,
    msgParamsV1,
    msgParamsV3,
    typedMsgs,
    messages,
    msgId,
    numberMsgId;

  const address = '0xc42edfcc21ed14dda456aa0756c153f7985d8813';
  const networkController = new NetworkController();
  sinon.stub(networkController, 'getChainId').returns('0x1');

  beforeEach(function () {
    typedMessageManager = new TypedMessageManager({
      networkController,
    });

    msgParamsV1 = {
      from: address,
      data: [
        { type: 'string', name: 'unit test', value: 'hello there' },
        {
          type: 'uint32',
          name: 'A number, but not really a number',
          value: '123',
        },
      ],
    };

    msgParamsV3 = {
      from: address,
      data: JSON.stringify({
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          Person: [
            { name: 'name', type: 'string' },
            { name: 'wallet', type: 'address' },
          ],
          Mail: [
            { name: 'from', type: 'Person' },
            { name: 'to', type: 'Person' },
            { name: 'contents', type: 'string' },
          ],
        },
        primaryType: 'Mail',
        domain: {
          name: 'Ether Mainl',
          version: '1',
          chainId: 1,
          verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
        },
        message: {
          from: {
            name: 'Cow',
            wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
          },
          to: {
            name: 'Bob',
            wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
          },
          contents: 'Hello, Bob!',
        },
      }),
    };

    typedMessageManager.addUnapprovedMessage(msgParamsV3, null, 'V3');
    typedMsgs = typedMessageManager.getUnapprovedMsgs();
    messages = typedMessageManager.messages;
    msgId = Object.keys(typedMsgs)[0];
    messages[0].msgParams.ecfWalletId = parseInt(msgId, 10);
    numberMsgId = parseInt(msgId, 10);
  });

  it('supports version 1 of signedTypedData', function () {
    typedMessageManager.addUnapprovedMessage(msgParamsV1, null, 'V1');
    assert.deepEqual(
      messages[messages.length - 1].msgParams.data,
      msgParamsV1.data,
    );
  });

  it('has params address', function () {
    assert.equal(typedMsgs[msgId].msgParams.from, address);
  });

  it('adds to unapproved messages and sets status to unapproved', function () {
    assert.equal(typedMsgs[msgId].status, 'unapproved');
  });

  it('validates params', function () {
    assert.doesNotThrow(() => {
      typedMessageManager.validateParams(messages[0].msgParams);
    }, 'Does not throw with valid parameters');
  });

  it('rejects a primary type that is only an inherited property of types', function () {
    const manager = typedMessageManager;
    for (const primaryType of ['toString', 'constructor', '__proto__']) {
      const data = JSON.parse(msgParamsV3.data);
      data.primaryType = primaryType;
      assert.throws(
        () =>
          manager.validateParams({
            from: address,
            data: JSON.stringify(data),
            version: 'V4',
          }),
        { message: `Primary type of "${primaryType}" has no type definition.` },
        primaryType,
      );
    }
  });

  it('rejects addresses the encoder would read as a different value than shown', function () {
    const manager = typedMessageManager;
    const spender = '0x0abcdef0abcdef0abcdef0abcdef0abcdef0abcd';
    for (const wallet of [
      `0x${spender.slice(3)}`,
      `0X${spender.slice(2)}`,
      BigInt(spender).toString(10),
    ]) {
      const data = JSON.parse(msgParamsV3.data);
      data.message.to.wallet = wallet;
      assert.throws(
        () =>
          manager.addUnapprovedMessage(
            { from: address, data: JSON.stringify(data) },
            null,
            'V4',
          ),
        /Invalid address value/u,
        wallet,
      );
    }
  });

  it('stores bools as booleans, so every signer encodes what is shown', function () {
    const data = {
      types: {
        EIP712Domain: [{ name: 'chainId', type: 'uint256' }],
        Permit: [
          { name: 'spender', type: 'address' },
          { name: 'allowed', type: 'bool' },
          { name: 'flags', type: 'bool[]' },
        ],
      },
      primaryType: 'Permit',
      domain: { chainId: 1 },
      message: {
        spender: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
        allowed: 'false',
        flags: ['true', false],
      },
    };
    typedMessageManager.addUnapprovedMessage(
      { from: address, data: JSON.stringify(data) },
      null,
      'V4',
    );
    const stored = JSON.parse(messages[messages.length - 1].msgParams.data);
    assert.strictEqual(stored.message.allowed, false);
    assert.deepStrictEqual(stored.message.flags, [true, false]);

    data.message.allowed = 'no';
    assert.throws(
      () =>
        typedMessageManager.addUnapprovedMessage(
          { from: address, data },
          null,
          'V4',
        ),
      /Invalid bool value/u,
    );
  });

  it('gets unapproved by id', function () {
    const getMsg = typedMessageManager.getMsg(numberMsgId);
    assert.equal(getMsg.id, numberMsgId);
  });

  it('approves messages', async function () {
    const messageEcfWalletId = messages[0].msgParams;
    typedMessageManager.approveMessage(messageEcfWalletId);
    assert.equal(messages[0].status, 'approved');
  });

  it('sets msg status to signed and adds a raw sig to message details', function () {
    typedMessageManager.setMsgStatusSigned(numberMsgId, 'raw sig');
    assert.equal(messages[0].status, 'signed');
    assert.equal(messages[0].rawSig, 'raw sig');
  });

  it('rejects message', function () {
    typedMessageManager.rejectMsg(numberMsgId);
    assert.equal(messages[0].status, 'rejected');
  });
});
