import { BigNumber } from 'bignumber.js';
import PropTypes from 'prop-types';
import React, { useState, useRef } from 'react';

import TextField from '../../components/ui/text-field';
import { bigNumberInBase } from '../../helpers/utils/conversion-util';

// A plain decimal number: no sign, separators or exponent.
const DECIMAL_INPUT = /^(?:\d+\.?\d*|\.\d+)$/u;

/**
 * Reads a field the user typed.
 *
 * @param {string} text - The field's contents
 * @param {number} scale - What to multiply the number by
 * @returns {BigNumber|null} The scaled number, or null if the text is not a
 * plain decimal number
 */
function parseField(text, scale) {
  const trimmed = String(text).trim();
  return DECIMAL_INPUT.test(trimmed)
    ? new BigNumber(trimmed).times(scale)
    : null;
}

export default function FeeMarketInputs({
  params,
  onChange,
  onValidityChange,
  priorityReadOnly = false,
  minimumMaxFeePerGas,
}) {
  const [values, setValues] = useState({
    maxFeePerGas: bigNumberInBase(params.maxFeePerGas, 16).div(1e9).toFixed(),
    maxPriorityFeePerGas: bigNumberInBase(params.maxPriorityFeePerGas, 16)
      .div(1e9)
      .toFixed(),
    gasLimit: bigNumberInBase(params.gas, 16).toFixed(),
  });
  const [error, setError] = useState('');
  const revision = useRef(0);
  function edit(field, value) {
    revision.current += 1;
    const editRevision = revision.current;
    const next = { ...values, [field]: value };
    setValues(next);
    // Until this edit is checked and saved, the transaction may still hold
    // the previous fees, so it must not be approved.
    onValidityChange(false);
    const cap = parseField(next.maxFeePerGas, 1e9);
    const tip = parseField(next.maxPriorityFeePerGas, 1e9);
    const gas = parseField(next.gasLimit, 1);
    const valid =
      [cap, tip, gas].every((number) => number?.isInteger()) &&
      cap.gte(tip) &&
      gas.gte(21000) &&
      (!minimumMaxFeePerGas ||
        cap.gte(bigNumberInBase(minimumMaxFeePerGas, 16)));
    setError(
      valid
        ? ''
        : 'Enter valid fees and a gas limit of at least 21000. The maximum fee must cover the priority fee and any replacement fee increase.',
    );
    if (valid) {
      // eslint-disable-next-line promise/catch-or-return -- rejections are handled by the second argument to then()
      Promise.resolve(
        onChange({
          maxFeePerGas: `0x${cap.toString(16)}`,
          maxPriorityFeePerGas: `0x${tip.toString(16)}`,
          gasLimit: `0x${gas.toString(16)}`,
        }),
      ).then(
        () => {
          if (revision.current === editRevision) {
            onValidityChange(true);
          }
          return undefined;
        },
        (saveError) => {
          if (revision.current === editRevision) {
            setError(
              saveError.message ||
                'Unable to save transaction fees. Please retry.',
            );
          }
        },
      );
    }
  }
  return (
    <div>
      <p>
        The total is the maximum you authorize. Unused gas and the difference
        from the actual gas price are not charged.
      </p>
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
  );
}

FeeMarketInputs.propTypes = {
  params: PropTypes.object.isRequired,
  priorityReadOnly: PropTypes.bool,
  minimumMaxFeePerGas: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onValidityChange: PropTypes.func.isRequired,
};
