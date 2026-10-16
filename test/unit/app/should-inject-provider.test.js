import { strict as assert } from 'assert';

import shouldInjectProvider from '../../../app/scripts/lib/should-inject-provider';
import { openPage } from '../../lib/page-globals';

const HTML = '<!doctype html><html><body></body></html>';

describe('shouldInjectProvider', function () {
  let restore;

  function load(html, options) {
    restore = openPage(html, options);
    return shouldInjectProvider();
  }

  afterEach(function () {
    restore?.();
    restore = undefined;
  });

  it('injects into an HTML page', function () {
    assert.equal(load(HTML, { url: 'https://dapp.example/app' }), true);
  });

  it('injects into a page without a doctype', function () {
    assert.equal(load('<html><body></body></html>'), true);
  });

  it('skips a document with another doctype', function () {
    assert.equal(
      load('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"><svg></svg>'),
      false,
    );
  });

  it('skips XML documents', function () {
    assert.equal(
      load('<?xml version="1.0"?><feed></feed>', {
        contentType: 'application/xml',
      }),
      false,
    );
  });

  it('skips PDF and XML files by path, ignoring the query', function () {
    assert.equal(load(HTML, { url: 'https://dapp.example/doc.pdf' }), false);
    restore();
    assert.equal(load(HTML, { url: 'https://dapp.example/feed.xml' }), false);
    restore();
    assert.equal(
      load(HTML, { url: 'https://dapp.example/view?file=doc.pdf' }),
      true,
    );
  });

  it('skips sites known to break with a provider', function () {
    for (const url of [
      'https://www.dropbox.com/home',
      'https://dropbox.com/',
      'https://pacer.uscourts.gov/',
      'https://cdn.shopify.com/s/javascripts/tricorder/xtld-read-only-frame.html',
    ]) {
      assert.equal(load(HTML, { url }), false, url);
      restore();
    }
    assert.equal(load(HTML, { url: 'https://shopify.com/' }), true);
  });
});
