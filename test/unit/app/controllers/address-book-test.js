import { strict as assert } from 'assert';

import { createAddressBookController } from '../../../../app/scripts/lib/modern-controllers-implementation';

const address = '0x0dcd5d886577d5081b0c52e242ef29e70be3e7bc';
const checksummed = '0x0DCD5D886577d5081B0c52e242Ef29E70Be3E7bc';

describe('AddressBookController', function () {
  const create = (state) => createAddressBookController(state);

  it('loads entries saved by the legacy controller under their network id', function () {
    const legacy = {
      addressBook: {
        1: {
          [checksummed]: {
            address: checksummed,
            chainId: '1',
            isEns: false,
            memo: '',
            name: 'Alice',
          },
        },
      },
    };
    const { controller, store } = create(legacy);
    assert.equal(store.getState().addressBook['1'][checksummed].name, 'Alice');
    assert.equal(controller.delete('1', address), true);
    assert.deepEqual(store.getState().addressBook, {});
  });

  it('keys new entries by the network id the UI passes and notifies subscribers', function () {
    const { controller, store } = create();
    const seen = [];
    store.subscribe((state) => seen.push(state));
    assert.equal(controller.set(address, 'Bob', '11155111', 'memo'), true);
    const entry = store.getState().addressBook['11155111'][checksummed];
    assert.equal(entry.name, 'Bob');
    assert.equal(entry.memo, 'memo');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].addressBook['11155111'][checksummed].name, 'Bob');
  });

  it('rejects invalid addresses and unsafe keys', function () {
    const { controller } = create();
    assert.equal(controller.set('0x123', 'Bad', '1'), false);
    assert.equal(controller.delete('__proto__', address), false);
  });
});
