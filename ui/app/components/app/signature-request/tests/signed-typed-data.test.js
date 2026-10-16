import assert from 'assert';

import { getSignedTypedData } from '../../../../../../app/scripts/lib/signed-typed-data';

describe('getSignedTypedData', function () {
  const types = {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Permit: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'holder', type: 'Person' },
      { name: 'cc', type: 'Person[]' },
    ],
    Person: [{ name: 'wallet', type: 'address' }],
  };

  it('leaves out fields the types do not declare, which are not signed', function () {
    const { domain, message } = getSignedTypedData({
      types,
      primaryType: 'Permit',
      domain: {
        name: 'Token',
        verifyingContract: '0x0000000000000000000000000000000000000001',
        // Not in EIP712Domain, so the signature works on any chain.
        chainId: 1,
      },
      message: {
        spender: '0x0000000000000000000000000000000000000002',
        value: '1000000000000000000000000',
        vaIue: '1',
        holder: { wallet: '0x0000000000000000000000000000000000000003', x: 1 },
        cc: [{ wallet: '0x0000000000000000000000000000000000000004', y: 2 }],
      },
    });

    assert.deepStrictEqual(domain, {
      name: 'Token',
      verifyingContract: '0x0000000000000000000000000000000000000001',
    });
    assert.deepStrictEqual(message, {
      spender: '0x0000000000000000000000000000000000000002',
      value: '1000000000000000000000000',
      holder: { wallet: '0x0000000000000000000000000000000000000003' },
      cc: [{ wallet: '0x0000000000000000000000000000000000000004' }],
    });
  });

  it('shows no message when the primary type is the domain', function () {
    const { message } = getSignedTypedData({
      types,
      primaryType: 'EIP712Domain',
      domain: { name: 'Token' },
      message: { value: 'not signed' },
    });
    assert.deepStrictEqual(message, {});
  });

  it('shows nothing for missing or malformed types', function () {
    assert.deepStrictEqual(
      getSignedTypedData({
        primaryType: 'Mail',
        domain: { name: 'x' },
        message: { a: 1 },
      }),
      { domain: {}, message: {} },
    );
    assert.deepStrictEqual(
      getSignedTypedData({
        types: { Mail: 'nope', EIP712Domain: [] },
        primaryType: 'Mail',
        domain: 'x',
        message: { a: 1 },
      }),
      { domain: {}, message: {} },
    );
  });

  it('stops on a recursive type', function () {
    const node = { next: null };
    node.next = node;
    const { message } = getSignedTypedData({
      types: { EIP712Domain: [], Node: [{ name: 'next', type: 'Node' }] },
      primaryType: 'Node',
      domain: {},
      message: node,
    });
    assert.ok(message);
  });
});
