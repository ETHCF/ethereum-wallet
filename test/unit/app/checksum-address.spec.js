import { strict as assert } from 'assert'
import { toChecksumHexAddress } from '../../../app/scripts/lib/checksum-address'

describe('toChecksumHexAddress', function () {
  it('checksums a hex address', function () {
    assert.equal(toChecksumHexAddress('0x5cfe73b6021e818b776b421b1c4db2474086a7e1'), '0x5CfE73b6021E818B776b421B1c4Db2474086a7e1')
  })

  it('returns anything else unchanged instead of throwing', function () {
    for (const value of ['0x5cfe', '5cfe73b6021e818b776b421b1c4db2474086a7e1', 'vitalik.eth', '', undefined, null, 5]) {
      assert.equal(toChecksumHexAddress(value), value)
    }
  })
})
