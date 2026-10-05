import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';

import EditApprovalPermission from '../edit-approval-permission.component';

const render = () =>
  shallow(
    <EditApprovalPermission
      decimals={18}
      hideModal={() => undefined}
      origin="https://dapp.example"
      tokenAmount="1000"
      tokenSymbol="TST"
      tokenBalance="5"
      selectedIdentity={{ name: 'Account 1', address: '0x0' }}
    />,
    { context: { t: (key) => key } },
  );

describe('EditApprovalPermission', function () {
  describe('validateSpendLimit', function () {
    it('reports input that is not a number instead of throwing', function () {
      const wrapper = render();
      for (const customSpendLimit of ['abc', '2,5', 'NaN', '-1']) {
        wrapper.setState({
          customSpendLimit,
          selectedOptionIsUnlimited: false,
        });
        assert.equal(
          wrapper.instance().validateSpendLimit(),
          'spendLimitInvalid',
          customSpendLimit,
        );
      }
    });

    it('accepts large and small amounts and rejects ones beyond uint256', function () {
      const wrapper = render();
      for (const customSpendLimit of ['1000', '1e+21', '0.0000001']) {
        wrapper.setState({
          customSpendLimit,
          selectedOptionIsUnlimited: false,
        });
        assert.equal(
          wrapper.instance().validateSpendLimit(),
          undefined,
          customSpendLimit,
        );
      }
      wrapper.setState({ customSpendLimit: '1e+60' });
      assert.equal(
        wrapper.instance().validateSpendLimit(),
        'spendLimitTooLarge',
      );
    });
  });
});
