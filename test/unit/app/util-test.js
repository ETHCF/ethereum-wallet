import assert from 'assert';

import {
  ENVIRONMENT_TYPE_POPUP,
  ENVIRONMENT_TYPE_NOTIFICATION,
  ENVIRONMENT_TYPE_FULLSCREEN,
  ENVIRONMENT_TYPE_BACKGROUND,
} from '../../../app/scripts/lib/enums';
import { getEnvironmentType } from '../../../app/scripts/lib/util';

describe('app utils', function () {
  describe('getEnvironmentType', function () {
    it('should return popup type', function () {
      const environmentType = getEnvironmentType(
        'http://extension-id/popup.html',
      );
      assert.equal(environmentType, ENVIRONMENT_TYPE_POPUP);
    });

    it('should return notification type', function () {
      const environmentType = getEnvironmentType(
        'http://extension-id/notification.html',
      );
      assert.equal(environmentType, ENVIRONMENT_TYPE_NOTIFICATION);
    });

    it('should return fullscreen type for home.html', function () {
      const environmentType = getEnvironmentType(
        'http://extension-id/home.html',
      );
      assert.equal(environmentType, ENVIRONMENT_TYPE_FULLSCREEN);
    });

    it('does not give phishing.html a user interface type', function () {
      const environmentType = getEnvironmentType(
        'http://extension-id/phishing.html',
      );
      assert.equal(environmentType, ENVIRONMENT_TYPE_BACKGROUND);
    });

    it('should return background type', function () {
      const environmentType = getEnvironmentType(
        'http://extension-id/_generated_background_page.html',
      );
      assert.equal(environmentType, ENVIRONMENT_TYPE_BACKGROUND);
    });

    it('should return the correct type for a URL with a hash fragment', function () {
      const environmentType = getEnvironmentType(
        'http://extension-id/popup.html#hash',
      );
      assert.equal(environmentType, ENVIRONMENT_TYPE_POPUP);
    });

    it('should return the correct type for a URL with query parameters', function () {
      const environmentType = getEnvironmentType(
        'http://extension-id/popup.html?param=foo',
      );
      assert.equal(environmentType, ENVIRONMENT_TYPE_POPUP);
    });

    it('should return the correct type for a URL with query parameters and a hash fragment', function () {
      const environmentType = getEnvironmentType(
        'http://extension-id/popup.html?param=foo#hash',
      );
      assert.equal(environmentType, ENVIRONMENT_TYPE_POPUP);
    });
  });
});
