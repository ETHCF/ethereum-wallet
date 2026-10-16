import createFilterMiddleware from '@metamask/eth-json-rpc-filters';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { strict as assert } from 'assert';
import EventEmitter from 'events';

import createFilterIdMiddleware from '../../../app/scripts/lib/createFilterIdMiddleware';

describe('Filter IDs', function () {
  // One provider connection, as the background sets it up.
  function createConnection() {
    const blockTracker = new EventEmitter();
    blockTracker.getLatestBlock = async () => '0x10';
    const provider = {
      request: async () => null,
      sendAsync: (_req, callback) => callback(null, { result: null }),
    };
    const engine = new JsonRpcEngine();
    engine.push(createFilterIdMiddleware());
    engine.push(createFilterMiddleware({ provider, blockTracker }));
    let id = 0;
    return (method, params = []) => {
      id += 1;
      return engine.handle({ jsonrpc: '2.0', id, method, params });
    };
  }

  it('gives filters random IDs that a later connection does not reuse', async function () {
    const oldConnection = createConnection();
    const { result: oldId } = await oldConnection('eth_newBlockFilter');
    assert.match(oldId, /^0x[0-9a-f]{32}$/u);
    assert.deepEqual(
      (await oldConnection('eth_getFilterChanges', [oldId])).result,
      [],
    );

    // The background restarted: the page's filter is gone, and the new
    // connection's first filter has the same ID inside the filter middleware.
    const newConnection = createConnection();
    const { result: newId } = await newConnection('eth_newBlockFilter');
    assert.notEqual(newId, oldId);

    for (const method of ['eth_getFilterChanges', 'eth_getFilterLogs']) {
      const { error } = await newConnection(method, [oldId]);
      assert.equal(error.code, -32000, method);
      assert.equal(error.message, 'filter not found', method);
    }
    assert.deepEqual(
      (await newConnection('eth_getFilterChanges', [newId])).result,
      [],
    );
  });

  it('answers removing an unknown filter with false, and forgets removed ones', async function () {
    const connection = createConnection();
    assert.equal(
      (await connection('eth_uninstallFilter', ['0x1'])).result,
      false,
    );

    const { result: id } = await connection('eth_newFilter', [{}]);
    assert.equal(
      (
        await connection('eth_uninstallFilter', [
          id.toUpperCase().replace('0X', '0x'),
        ])
      ).result,
      true,
    );
    assert.equal((await connection('eth_uninstallFilter', [id])).result, false);
    const { error } = await connection('eth_getFilterChanges', [id]);
    assert.equal(error.message, 'filter not found');
  });

  it("refuses the filter middleware's own counted IDs", async function () {
    const connection = createConnection();
    await connection('eth_newBlockFilter');
    const { error } = await connection('eth_getFilterChanges', ['0x1']);
    assert.equal(error.code, -32000);
  });
});
