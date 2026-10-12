import assert from 'assert';
import React from 'react';

import { mountWithRouter } from '../../../../../../test/lib/render-helpers';
import RequestSite, { displayOrigin } from '../request-site.component';

describe('RequestSite', function () {
  it("shows an https site's host", function () {
    const wrapper = mountWithRouter(
      <RequestSite origin="https://app.example.com:8443" />,
    );
    assert.equal(
      wrapper.find('.request-site__value').text(),
      'app.example.com:8443',
    );
  });

  it('shows the whole origin when it is not https', function () {
    assert.equal(displayOrigin('http://example.com'), 'http://example.com');
    assert.equal(
      displayOrigin('chrome-extension://abcdef'),
      'chrome-extension://abcdef',
    );
    assert.equal(displayOrigin('not a url'), 'not a url');
  });

  it("shows nothing for the wallet's own requests", function () {
    assert.equal(
      mountWithRouter(<RequestSite origin="ecf-wallet" />)
        .find('[data-testid="request-site"]')
        .exists(),
      false,
    );
    assert.equal(
      mountWithRouter(<RequestSite />)
        .find('[data-testid="request-site"]')
        .exists(),
      false,
    );
  });
});
