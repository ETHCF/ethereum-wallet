import contractMap from '@metamask/contract-metadata';
import classnames from 'classnames';
import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';

import EcfIdenticon from './ecf-identicon';
import { checksumAddress } from '../../../helpers/utils/util';

const getStyles = (diameter) => ({
  height: diameter,
  width: diameter,
  borderRadius: 0,
});

export default class Identicon extends PureComponent {
  static propTypes = {
    addBorder: PropTypes.bool,
    address: PropTypes.string,
    className: PropTypes.string,
    diameter: PropTypes.number,
    image: PropTypes.string,
    nativeCurrencyImage: PropTypes.string,
  };

  static defaultProps = {
    addBorder: false,
    address: undefined,
    className: undefined,
    diameter: 46,
    image: undefined,
    nativeCurrencyImage: undefined,
  };

  renderImage() {
    const { className, diameter, image } = this.props;

    return (
      <img
        className={classnames('identicon', className)}
        src={image}
        style={getStyles(diameter)}
      />
    );
  }

  renderContractLogo(logo) {
    const { className, diameter } = this.props;

    return (
      <img
        className={classnames('identicon', className)}
        src={`./images/contract/${logo}`}
        style={getStyles(diameter)}
      />
    );
  }

  renderIdenticon() {
    const { address, className, diameter } = this.props;

    return (
      <EcfIdenticon
        address={address}
        diameter={diameter}
        className={className}
      />
    );
  }

  render() {
    const {
      className,
      address,
      image,
      diameter,
      addBorder,
      nativeCurrencyImage,
    } = this.props;

    if (image) {
      return this.renderImage();
    }

    if (address) {
      const checksummedAddress = checksumAddress(address);

      // A token we ship metadata for draws its own logo rather than an identicon.
      const { logo } = contractMap[checksummedAddress] || {};
      if (logo) {
        return this.renderContractLogo(logo);
      }

      return (
        <div
          className={classnames({ 'identicon__address-wrapper': addBorder })}
        >
          {this.renderIdenticon()}
        </div>
      );
    }

    return (
      <img
        className={classnames('identicon__eth-logo', className)}
        src={nativeCurrencyImage || './images/eth_logo.svg'}
        style={getStyles(diameter)}
      />
    );
  }
}
