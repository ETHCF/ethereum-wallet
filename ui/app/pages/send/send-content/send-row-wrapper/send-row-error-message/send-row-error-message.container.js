import { connect } from 'react-redux';

import SendRowErrorMessage from './send-row-error-message.component';
import { getSendErrors } from '../../../../../selectors';

export default connect(mapStateToProps)(SendRowErrorMessage);

function mapStateToProps(state, ownProps) {
  return {
    errors: getSendErrors(state),
    errorType: ownProps.errorType,
  };
}
