import React, { PureComponent } from 'react'
import PropTypes from 'prop-types'
import UnitInput from '../unit-input'
import { getValueFromWeiHex, getWeiHexFromDecimalValue } from '../../../helpers/utils/conversions.util'
import { ETH } from '../../../helpers/constants/common'

/**
 * Component that allows user to enter an amount of the native currency as a number, and props
 * receive a converted hex value in WEI. props.value, used as a default or forced value, should
 * be a hex value, which gets converted into a decimal value.
 */
export default class CurrencyInput extends PureComponent {
  static propTypes = {
    maxModeOn: PropTypes.bool,
    nativeCurrency: PropTypes.string,
    onChange: PropTypes.func,
    value: PropTypes.string,
  }

  constructor (props) {
    super(props)

    const { value: hexValue } = props
    const decimalValue = hexValue ? this.getDecimalValue(props) : 0

    this.state = {
      decimalValue,
      hexValue,
    }
  }

  componentDidUpdate (prevProps) {
    const { value: prevPropsHexValue } = prevProps
    const { value: propsHexValue } = this.props
    const { hexValue: stateHexValue } = this.state

    if (prevPropsHexValue !== propsHexValue && propsHexValue !== stateHexValue) {
      const decimalValue = this.getDecimalValue(this.props)
      this.setState({ hexValue: propsHexValue, decimalValue })
    }
  }

  getDecimalValue (props) {
    const { value: hexValue } = props
    const decimalValueString = getValueFromWeiHex({
      value: hexValue, toCurrency: ETH, numberOfDecimals: 6,
    })

    return Number(decimalValueString) || 0
  }

  handleChange = (decimalValue) => {
    const { onChange } = this.props

    const hexValue = getWeiHexFromDecimalValue({
      value: decimalValue, fromCurrency: ETH, fromDenomination: ETH,
    })

    this.setState({ hexValue, decimalValue })
    onChange(hexValue)
  }

  render () {
    const { nativeCurrency, maxModeOn, ...restProps } = this.props
    const { decimalValue } = this.state

    return (
      <UnitInput
        {...restProps}
        suffix={nativeCurrency || ETH}
        onChange={this.handleChange}
        value={decimalValue}
        maxModeOn={maxModeOn}
      />
    )
  }
}
