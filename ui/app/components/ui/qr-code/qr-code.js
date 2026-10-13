import PropTypes from 'prop-types';
import qrCode from 'qrcode-generator';
import React from 'react';
import { connect } from 'react-redux';

import { checksumAddress } from '../../../helpers/utils/util';
import ReadOnlyInput from '../readonly-input/readonly-input';

export default connect(mapStateToProps)(QrCodeView);

function mapStateToProps(state) {
  return {
    // Qr code is not fetched from state. 'message' and 'data' props are passed instead.
    warning: state.appState.warning,
  };
}

function QrCodeView(props) {
  const { message, data } = props.Qr;
  const address = `${data.startsWith('0x') ? 'ethereum:' : ''}${checksumAddress(data)}`;
  const qrImage = qrCode(4, 'M');
  qrImage.addData(address);
  qrImage.make();

  return (
    <div className="qr-code">
      {Array.isArray(message) ? (
        <div className="qr-code__message-container">
          {props.Qr.message.map((msg, index) => (
            <div className="qr_code__message" key={index}>
              {msg}
            </div>
          ))}
        </div>
      ) : (
        message && <div className="qr-code__header">{message}</div>
      )}
      {props.warning
        ? props.warning && (
            <span className="qr_code__error">{props.warning}</span>
          )
        : null}
      <div
        className="qr-code__wrapper"
        dangerouslySetInnerHTML={{
          __html: qrImage.createTableTag(4),
        }}
      />
      <ReadOnlyInput
        wrapperClass="ellip-address-wrapper"
        value={checksumAddress(data)}
      />
    </div>
  );
}

QrCodeView.propTypes = {
  warning: PropTypes.node,
  Qr: PropTypes.shape({
    message: PropTypes.oneOfType([
      PropTypes.arrayOf(PropTypes.node),
      PropTypes.node,
    ]),
    data: PropTypes.string.isRequired,
  }).isRequired,
};
