import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';

import ConfirmApproveContent from '../confirm-approve-content.component';

const SPENDER = '0x2f318c334780961fb129d2a6c30d0763d9a5c970';

const render = (props) =>
  shallow(
    <ConfirmApproveContent
      decimals={18}
      origin="Dapp.example"
      tokenSymbol="TST"
      toAddress={SPENDER}
      showEditApprovalPermissionModal={() => undefined}
      {...props}
    />,
    { context: { t: (key) => key } },
  );

describe('ConfirmApproveContent', function () {
  it('shows the checksummed spender and the amount without expanding details', function () {
    const wrapper = render({ tokenAmount: '1234567.000000000000000001' });
    assert.equal(
      wrapper.find('[data-testid="approve-spender"]').text(),
      '0x2f318C334780961FB129D2a6c30D0763d9a5C970',
    );
    assert.equal(
      wrapper.find('[data-testid="approve-amount"]').text(),
      '1234567.000000000000000001 TST',
    );
  });

  it('labels unlimited approvals, and shows a custom amount instead', function () {
    const unlimited = render({
      tokenAmount:
        '115792089237316195423570985008687907853269984665640564039457.584007913129639935',
    });
    assert.equal(
      unlimited.find('[data-testid="approve-amount"]').text(),
      'unlimited TST',
    );
    const custom = render({
      tokenAmount:
        '115792089237316195423570985008687907853269984665640564039457.584007913129639935',
      customTokenAmount: '25',
    });
    assert.equal(
      custom.find('[data-testid="approve-amount"]').text(),
      '25 TST',
    );
  });
});
