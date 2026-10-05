import React, { PureComponent } from 'react'
import PropTypes from 'prop-types'
import * as ethUtil from '@ethereumjs/util'
import UnitInput from '../unit-input'
import { conversionUtil, multiplyCurrencies } from '../../../helpers/utils/conversion-util'

/**
 * Component that allows user to enter token values as a number, and props receive a converted
 * hex value. props.value, used as a default or forced value, should be a hex value, which
 * gets converted into a decimal value.
 */
export default class TokenInput extends PureComponent {
  static propTypes = {
    onChange: PropTypes.func,
    value: PropTypes.string,
    token: PropTypes.shape({
      address: PropTypes.string.isRequired,
      decimals: PropTypes.number,
      symbol: PropTypes.string,
    }).isRequired,
  }

  constructor (props) {
    super(props)

    const { value: hexValue } = props
    const decimalValue = hexValue ? this.getValue(props) : 0

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
      const decimalValue = this.getValue(this.props)
      this.setState({ hexValue: propsHexValue, decimalValue })
    }
  }

  getValue (props) {
    const { value: hexValue, token: { decimals, symbol } = {} } = props

    const multiplier = Math.pow(10, Number(decimals || 0))
    const decimalValueString = conversionUtil(ethUtil.addHexPrefix(hexValue), {
      fromNumericBase: 'hex',
      toNumericBase: 'dec',
      toCurrency: symbol,
      conversionRate: multiplier,
      invertConversionRate: true,
    })

    return Number(decimalValueString) ? decimalValueString : ''
  }

  handleChange = (decimalValue) => {
    const { token: { decimals } = {}, onChange } = this.props

    const multiplier = Math.pow(10, Number(decimals || 0))
    const hexValue = multiplyCurrencies(decimalValue || 0, multiplier, { toNumericBase: 'hex' })

    this.setState({ hexValue, decimalValue })
    onChange(hexValue)
  }

  render () {
    const { token, ...restProps } = this.props
    const { decimalValue } = this.state

    return (
      <UnitInput
        {...restProps}
        suffix={token.symbol}
        onChange={this.handleChange}
        value={decimalValue}
      />
    )
  }
}
