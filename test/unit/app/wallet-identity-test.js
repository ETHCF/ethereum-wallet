import assert from 'assert';
import { createHash, createPublicKey } from 'crypto';

import brave from '../../../app/manifest/brave.json';
import chrome from '../../../app/manifest/chrome.json';
import firefox from '../../../app/manifest/firefox.json';
import opera from '../../../app/manifest/opera.json';

describe('ECF Wallet extension identity', function () {
  for (const [platform, manifest] of Object.entries({ chrome, brave, opera })) {
    it(`keeps a stable, separate storage identity on ${platform}`, function () {
      const publicKey = Buffer.from(manifest.key, 'base64');
      assert.equal(
        createPublicKey({ key: publicKey, format: 'der', type: 'spki' })
          .asymmetricKeyType,
        'rsa',
      );
      const extensionId = createHash('sha256')
        .update(publicKey)
        .digest('hex')
        .slice(0, 32)
        .replace(/[0-9a-f]/gu, (digit) =>
          String.fromCharCode(97 + parseInt(digit, 16)),
        );

      assert.equal(extensionId, 'fchaokinkaebjeonmpikbllcjaenmjdp');
      assert.notEqual(extensionId, 'nkbihfbeogaeaoehlefnkodbefgpgknn');
    });
  }

  it('keeps a separate Firefox add-on and storage identity', function () {
    assert.equal(
      firefox.browser_specific_settings.gecko.id,
      'wallet@ethcf.org',
    );
  });
});
