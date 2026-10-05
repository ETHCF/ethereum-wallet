import { connect } from 'react-redux';

import TokenList from './token-list.component';

const mapStateToProps = ({ ecfWallet }) => {
  const { tokens } = ecfWallet;
  return {
    tokens,
  };
};

export default connect(mapStateToProps)(TokenList);
