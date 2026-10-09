import PropTypes from 'prop-types';
import React from 'react';

import {
  TRANSACTION_CATEGORY_APPROVAL,
  TRANSACTION_CATEGORY_SIGNATURE_REQUEST,
  TRANSACTION_CATEGORY_INTERACTION,
  TRANSACTION_CATEGORY_SEND,
  UNAPPROVED_STATUS,
  FAILED_STATUS,
  REJECTED_STATUS,
  CANCELLED_STATUS,
  DROPPED_STATUS,
  SUBMITTED_STATUS,
  APPROVED_STATUS,
} from '../../../helpers/constants/transactions';
import Approve from '../../ui/icon/approve-icon.component';
import Interaction from '../../ui/icon/interaction-icon.component';
import Send from '../../ui/icon/send-icon.component';
import Sign from '../../ui/icon/sign-icon.component';

const ICON_MAP = {
  [TRANSACTION_CATEGORY_APPROVAL]: Approve,
  [TRANSACTION_CATEGORY_INTERACTION]: Interaction,
  [TRANSACTION_CATEGORY_SEND]: Send,
  [TRANSACTION_CATEGORY_SIGNATURE_REQUEST]: Sign,
};

const FAIL_COLOR = 'var(--color-error-default)';
const PENDING_COLOR = 'var(--color-text-alternative)';
const OK_COLOR = 'var(--color-text-default)';

const COLOR_MAP = {
  [SUBMITTED_STATUS]: PENDING_COLOR,
  [UNAPPROVED_STATUS]: PENDING_COLOR,
  [APPROVED_STATUS]: PENDING_COLOR,
  [FAILED_STATUS]: FAIL_COLOR,
  [REJECTED_STATUS]: FAIL_COLOR,
  [CANCELLED_STATUS]: FAIL_COLOR,
  [DROPPED_STATUS]: FAIL_COLOR,
};

export default function TransactionIcon({ status, category }) {
  const color = COLOR_MAP[status] || OK_COLOR;

  const Icon = ICON_MAP[category];

  return <Icon color={color} size={28} />;
}

TransactionIcon.propTypes = {
  status: PropTypes.string.isRequired,
  category: PropTypes.string.isRequired,
};
