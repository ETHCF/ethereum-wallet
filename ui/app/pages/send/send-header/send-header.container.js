import { connect } from 'react-redux';

import SendHeader from './send-header.component';
import { getMostRecentOverviewPage } from '../../../ducks/history/history';
import { getTitleKey } from '../../../selectors';
import { clearSend } from '../../../store/actions';

export default connect(mapStateToProps, mapDispatchToProps)(SendHeader);

function mapStateToProps(state) {
  return {
    mostRecentOverviewPage: getMostRecentOverviewPage(state),
    titleKey: getTitleKey(state),
  };
}

function mapDispatchToProps(dispatch) {
  return {
    clearSend: () => dispatch(clearSend()),
  };
}
