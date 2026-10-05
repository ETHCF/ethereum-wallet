import assert from 'assert';
import { shallow } from 'enzyme';
import React from 'react';

import TransactionActivityLog from '../transaction-activity-log.component';

describe('TransactionActivityLog Component', function () {
  it('should render inline retry and cancel buttons for earliest pending transaction', function () {
    const activities = [
      {
        eventKey: 'transactionCreated',
        hash: '0xa',
        id: 1,
        timestamp: 1,
        value: '0x1',
      },
      {
        eventKey: 'transactionSubmitted',
        hash: '0xa',
        id: 1,
        timestamp: 2,
        value: '0x1',
      },
      {
        eventKey: 'transactionResubmitted',
        hash: '0x7d09d337fc6f5d6fe2dbf3a6988d69532deb0a82b665f9180b5a20db377eea87',
        id: 2,
        timestamp: 3,
        value: '0x1',
      },
      {
        eventKey: 'transactionCancelAttempted',
        hash: '0x7d09d337fc6f5d6fe2dbf3a6988d69532deb0a82b665f9180b5a20db377eea87',
        id: 3,
        timestamp: 4,
        value: '0x1',
      },
    ];

    const wrapper = shallow(
      <TransactionActivityLog
        activities={activities}
        className="test-class"
        inlineRetryIndex={2}
        inlineCancelIndex={3}
        nativeCurrency="ETH"
        onCancel={() => undefined}
        onRetry={() => undefined}
        primaryTransactionStatus="pending"
        isEarliestNonce
      />,
      { context: { t: (str1, str2) => (str2 ? str1 + str2 : str1) } },
    );

    assert.ok(wrapper.hasClass('transaction-activity-log'));
    assert.ok(wrapper.hasClass('test-class'));
    assert.equal(
      wrapper.find('.transaction-activity-log__action-link').length,
      2,
    );
  });

  it('should not render inline retry and cancel buttons for newer pending transactions', function () {
    const activities = [
      {
        eventKey: 'transactionCreated',
        hash: '0xa',
        id: 1,
        timestamp: 1,
        value: '0x1',
      },
      {
        eventKey: 'transactionSubmitted',
        hash: '0xa',
        id: 1,
        timestamp: 2,
        value: '0x1',
      },
      {
        eventKey: 'transactionResubmitted',
        hash: '0x7d09d337fc6f5d6fe2dbf3a6988d69532deb0a82b665f9180b5a20db377eea87',
        id: 2,
        timestamp: 3,
        value: '0x1',
      },
      {
        eventKey: 'transactionCancelAttempted',
        hash: '0x7d09d337fc6f5d6fe2dbf3a6988d69532deb0a82b665f9180b5a20db377eea87',
        id: 3,
        timestamp: 4,
        value: '0x1',
      },
    ];

    const wrapper = shallow(
      <TransactionActivityLog
        activities={activities}
        className="test-class"
        inlineRetryIndex={2}
        inlineCancelIndex={3}
        nativeCurrency="ETH"
        onCancel={() => undefined}
        onRetry={() => undefined}
        primaryTransactionStatus="pending"
        isEarliestNonce={false}
      />,
      { context: { t: (str1, str2) => (str2 ? str1 + str2 : str1) } },
    );

    assert.ok(wrapper.hasClass('transaction-activity-log'));
    assert.ok(wrapper.hasClass('test-class'));
    assert.equal(
      wrapper.find('.transaction-activity-log__action-link').length,
      0,
    );
  });
});
