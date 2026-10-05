import React, { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { BigNumber } from 'bignumber.js'
import TextField from '../../components/ui/text-field'
import { bigNumberInBase } from '../../helpers/utils/conversion-util'

export default function FeeMarketInputs ({ params, onChange, onValidityChange, priorityReadOnly = false, minimumMaxFeePerGas }) {
  const [values, setValues] = useState({
    maxFeePerGas: bigNumberInBase(params.maxFeePerGas, 16).div(1e9).toFixed(),
    maxPriorityFeePerGas: bigNumberInBase(params.maxPriorityFeePerGas, 16).div(1e9).toFixed(),
    gasLimit: bigNumberInBase(params.gas, 16).toFixed(),
  })
  const [error, setError] = useState('')
  const revision = useRef(0)
  function edit (field, value) {
    revision.current += 1
    const editRevision = revision.current
    const next = { ...values, [field]: value }
    setValues(next)
    const cap = new BigNumber(next.maxFeePerGas).times(1e9)
    const tip = new BigNumber(next.maxPriorityFeePerGas).times(1e9)
    const gas = new BigNumber(next.gasLimit)
    const valid = [cap, tip, gas].every((number) => number.isFinite() && number.isInteger() && number.gte(0)) && cap.gte(tip) && gas.gte(21000) && (!minimumMaxFeePerGas || cap.gte(bigNumberInBase(minimumMaxFeePerGas, 16)))
    setError(valid ? '' : 'Enter valid fees and a gas limit of at least 21000. The maximum fee must cover the priority fee and any replacement fee increase.')
    onValidityChange(false)
    if (valid) {
      Promise.resolve(onChange({ maxFeePerGas: `0x${cap.toString(16)}`, maxPriorityFeePerGas: `0x${tip.toString(16)}`, gasLimit: `0x${gas.toString(16)}` })).then(() => {
        if (revision.current === editRevision) {
          onValidityChange(true)
        }
      }, (saveError) => {
        if (revision.current === editRevision) {
          setError(saveError.message || 'Unable to save transaction fees. Please retry.')
        }
      })
    }
  }
  return (
    <div>
      <p>The total is the maximum you authorize. Unused gas and the difference from the actual gas price are not charged.</p>
      {[
        ['maxFeePerGas', 'Maximum fee per gas (Gwei)'],
        ['maxPriorityFeePerGas', 'Priority fee per gas (Gwei)'],
        ['gasLimit', 'Gas limit'],
      ].map(([field, label]) => (
        <TextField
          key={field}
          label={label}
          name={field}
          value={values[field]}
          disabled={priorityReadOnly && field === 'maxPriorityFeePerGas'}
          onChange={(event) => edit(field, event.target.value)}
          fullWidth
        />
      ))}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

FeeMarketInputs.propTypes = {
  params: PropTypes.object.isRequired,
  priorityReadOnly: PropTypes.bool,
  minimumMaxFeePerGas: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onValidityChange: PropTypes.func.isRequired,
}
