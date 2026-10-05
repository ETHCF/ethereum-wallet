import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

import lockdownOptions from '../../../development/build/lockdown-options';

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const ses = read('../../../node_modules/ses/dist/lockdown.umd.min.js');
const lockdownMore = read('../../../app/scripts/lockdown-more.js');

describe('lockdown-more.js', function () {
  it('stops the bundle when SES lockdown has not run', function () {
    const realm = vm.createContext({});
    assert.throws(
      () => vm.runInContext(lockdownMore, realm),
      /SES lockdown has not run/u,
    );
  });

  it('protects the intrinsic globals once lockdown has run', function () {
    // Share no objects with this realm: harden would freeze them, and their
    // prototypes, here too.
    const realm = vm.createContext({});
    vm.runInContext(ses, realm);
    vm.runInContext(`lockdown(${JSON.stringify(lockdownOptions)})`, realm);
    vm.runInContext(lockdownMore, realm);
    assert.equal(
      vm.runInContext(
        `globalThis.Promise = function Evil() {}; Promise.name`,
        realm,
      ),
      'Promise',
    );
    // With evalTaming no-eval, eval and the Function constructor throw.
    assert.throws(() => vm.runInContext(`eval('1')`, realm), /no-eval/u);
    assert.throws(
      () => vm.runInContext(`Function('return 1')()`, realm),
      /no-eval/u,
    );
  });
});
