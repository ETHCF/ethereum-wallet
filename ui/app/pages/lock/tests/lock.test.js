import assert from 'assert';
import React from 'react';
import sinon from 'sinon';

import Lock from '..';
import { mountWithRouter } from '../../../../../test/lib/render-helpers';

describe('Lock', function () {
  it('navigates to the default route when isUnlocked false', function () {
    const props = {
      isUnlocked: false,
      navigate: sinon.spy(),
    };

    mountWithRouter(<Lock.WrappedComponent {...props} />);

    assert.equal(props.navigate.getCall(0).args[0], '/');
  });

  it('locks and navigates to the default route when isUnlocked true', function (done) {
    const props = {
      isUnlocked: true,
      lockEcfWallet: sinon.stub(),
      navigate: sinon.spy(),
    };

    props.lockEcfWallet.resolves();

    mountWithRouter(<Lock.WrappedComponent {...props} />);

    assert(props.lockEcfWallet.calledOnce);
    setImmediate(() => {
      assert.equal(props.navigate.getCall(0).args[0], '/');
      done();
    });
  });
});
