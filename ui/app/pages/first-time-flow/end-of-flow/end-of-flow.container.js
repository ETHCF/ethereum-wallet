import { connect } from 'react-redux';

import EndOfFlow from './end-of-flow.component';
import withRouter from '../../../helpers/higher-order-components/with-router';
import { getOnboardingInitiator } from '../../../selectors';

const mapStateToProps = (state) => {
  return {
    onboardingInitiator: getOnboardingInitiator(state),
  };
};

export default withRouter(connect(mapStateToProps)(EndOfFlow));
