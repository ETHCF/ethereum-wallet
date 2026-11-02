import assert from 'assert';
import { createHash, createPublicKey } from 'crypto';

import chromiumDevKey from '../../../app/manifest/_chromium-dev-key.json';
import brave from '../../../app/manifest/brave.json';
import chrome from '../../../app/manifest/chrome.json';
import firefox from '../../../app/manifest/firefox.json';
import opera from '../../../app/manifest/opera.json';

describe('MetaECF extension identity', function () {
  it('pins unpacked Chromium builds to the Chrome Web Store ID', function () {
    const publicKey = Buffer.from(chromiumDevKey.key, 'base64');
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

    assert.equal(extensionId, 'gcbminekfcgfihncdagcainadkogbflf');
    assert.notEqual(extensionId, 'nkbihfbeogaeaoehlefnkodbefgpgknn');
  });

  // The Chrome Web Store does not accept a manifest key; the build adds it to
  // non-prod builds only.
  for (const [platform, manifest] of Object.entries({ chrome, brave, opera })) {
    it(`leaves the key out of the ${platform} manifest`, function () {
      assert.equal(manifest.key, undefined);
    });
  }

  it('keeps a separate Firefox add-on and storage identity', function () {
    assert.equal(
      firefox.browser_specific_settings.gecko.id,
      'wallet@ethcf.org',
    );
  });
});
