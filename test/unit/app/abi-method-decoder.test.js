import { encode } from '@metamask/abi-utils';
import { strict as assert } from 'assert';
import tokenAbi from 'human-standard-token-abi';

import createMethodDecoder, {
  functionSelector,
} from '../../../app/scripts/lib/abi-method-decoder';

const decode = createMethodDecoder(tokenAbi);
const to = '0x00000000000000000000000000000000000000ab';
const call = (name, types, values) =>
  `0x${functionSelector(`${name}(${types})`)}${Buffer.from(encode(types, values)).toString('hex')}`;
const transfer = call(
  'transfer',
  ['address', 'uint256'],
  [to, '1000000000000000000000000'],
);

describe('createMethodDecoder', function () {
  it('decodes names, addresses and full-precision integers', function () {
    assert.deepEqual(decode(transfer), {
      name: 'transfer',
      params: [
        { name: '_to', value: to, type: 'address' },
        { name: '_value', value: '1000000000000000000000000', type: 'uint256' },
      ],
    });
  });

  it('decodes dynamic bytes and allows trailing data', function () {
    const data = call(
      'approveAndCall',
      ['address', 'uint256', 'bytes'],
      [to, 1, Buffer.from('beef', 'hex')],
    );
    assert.equal(decode(data).params[2].value, '0xbeef');
    assert.equal(decode(`${transfer}cafe`).name, 'transfer');
  });

  it('returns undefined for unknown, truncated, non-canonical or non-hex data', function () {
    const dirtyAddress = `${transfer.slice(0, 10)}ff${transfer.slice(12)}`;
    for (const data of [
      undefined,
      '',
      '0x',
      '0x12345678',
      transfer.slice(0, -2),
      transfer.slice(0, 74),
      dirtyAddress,
      `${transfer}0`,
      `${transfer.slice(0, -1)}g`,
    ]) {
      assert.equal(decode(data), undefined, String(data));
    }
  });
});
