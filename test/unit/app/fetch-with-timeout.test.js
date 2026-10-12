import assert from 'assert';
import nock from 'nock';

import fetchWithTimeout from '../../../app/scripts/lib/fetch-with-timeout';

describe('fetchWithTimeout', function () {
  it('fetches a url', async function () {
    nock('https://api.infura.io').get('/money').reply(200, '{"hodl": false}');

    const fetch = fetchWithTimeout();
    const response = await (await fetch('https://api.infura.io/money')).json();
    assert.deepEqual(response, {
      hodl: false,
    });
  });

  it('throws when the request hits a custom timeout', async function () {
    nock('https://api.infura.io')
      .get('/moon')
      .delay(2000)
      .reply(200, '{"moon": "2012-12-21T11:11:11Z"}');

    const fetch = fetchWithTimeout({
      timeout: 123,
    });

    await assert.rejects(async () => {
      await fetch('https://api.infura.io/moon').then((r) => r.json());
    });
  });

  it('should abort the request when the custom timeout is hit', async function () {
    nock('https://api.infura.io')
      .get('/moon')
      .delay(2000)
      .reply(200, '{"moon": "2012-12-21T11:11:11Z"}');

    const fetch = fetchWithTimeout({
      timeout: 123,
    });

    await assert.rejects(
      async () => {
        await fetch('https://api.infura.io/moon').then((r) => r.json());
      },
      // Each fetch words the message its own way; the name is standard.
      { name: 'AbortError' },
    );
  });
});
