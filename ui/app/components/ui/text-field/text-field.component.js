import React from 'react'
import PropTypes from 'prop-types'
import MaterialTextField from '@mui/material/TextField'

const inputLabelBase = {
  transform: 'none',
  transition: 'none',
  position: 'initial',
  color: 'var(--color-text-alternative)',
}

// Material UI 5 defaults to the outlined variant; these themes build on standard.
const getMaterialThemeInputProps = ({ dir, startAdornment }) => ({
  variant: 'standard',
  InputLabelProps: {
    sx: {
      '&.Mui-focused': {
        color: 'var(--color-text-alternative)',
      },
      '&.Mui-error': {
        color: 'var(--color-text-alternative)',
      },
      fontWeight: '400',
      color: 'var(--color-text-alternative)',
    },
  },
  InputProps: {
    startAdornment,
    sx: {
      '&:after': {
        borderBottom: '1px solid var(--color-border-default)',
      },
    },
    inputProps: {
      dir,
    },
  },
})

const getMaterialWhitePaddedThemeInputProps = ({ dir, startAdornment }) => ({
  variant: 'standard',
  InputProps: {
    startAdornment,
    sx: {
      color: 'var(--color-text-alternative)',
      '&.Mui-focused': {
        color: 'var(--color-text-default)',
      },
      '& .MuiInputBase-input': {
        padding: '8px',
        '&::placeholder': {
          color: 'var(--color-text-alternative)',
        },
      },
      '&:after': {
        borderBottom: '1px solid var(--color-border-default)',
      },
    },
    inputProps: {
      dir,
    },
  },
})

const getBorderedThemeInputProps = ({ dir, largeLabel, startAdornment, inputRootClassName }) => ({
  variant: 'standard',
  InputLabelProps: {
    shrink: true,
    sx: {
      ...inputLabelBase,
      fontSize: largeLabel ? '1rem' : '.75rem',
      '&.Mui-focused': {
        color: 'var(--color-text-alternative)',
      },
      '&.Mui-error': {
        color: 'var(--color-text-alternative)',
      },
    },
  },
  InputProps: {
    startAdornment,
    disableUnderline: true,
    className: inputRootClassName,
    sx: {
      'label + &': {
        marginTop: '9px',
      },
      border: '1px solid var(--color-border-default)',
      height: '48px',
      borderRadius: '0',
      padding: '0 16px',
      display: 'flex',
      alignItems: 'center',
      '&.Mui-focused': {
        border: '1px solid var(--color-primary-default)',
      },
    },
    inputProps: {
      dir,
    },
  },
})

// Material UI 5 draws disabled text and labels in a fixed dark grey, which
// cannot be read in dark mode. Disabled fields can still hold values the user
// needs, such as a token's symbol filled in from its contract.
const disabledSx = {
  '& .MuiInputBase-input.Mui-disabled': {
    color: 'var(--color-text-alternative)',
    WebkitTextFillColor: 'var(--color-text-alternative)',
  },
  '& .MuiInputLabel-root.Mui-disabled': {
    color: 'var(--color-text-alternative)',
  },
}

const themeToInputProps = {
  'material': getMaterialThemeInputProps,
  'bordered': getBorderedThemeInputProps,
  'material-white-padded': getMaterialWhitePaddedThemeInputProps,
}

const TextField = ({
  error,
  classes,
  theme,
  startAdornment,
  largeLabel,
  dir,
  sx,
  ...textFieldProps
}) => {
  const inputProps = themeToInputProps[theme]({
    startAdornment,
    largeLabel,
    dir,
    inputRootClassName: classes?.inputRoot,
  })

  return (
    <MaterialTextField
      error={Boolean(error)}
      helperText={error}
      {...inputProps}
      {...textFieldProps}
      sx={[disabledSx, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  )
}

TextField.defaultProps = {
  error: null,
  dir: 'auto',
  theme: 'bordered',
}

TextField.propTypes = {
  error: PropTypes.string,
  // Extra class names; `inputRoot` is added to the bordered theme's input.
  classes: PropTypes.shape({
    inputRoot: PropTypes.string,
  }),
  dir: PropTypes.string,
  theme: PropTypes.oneOf(['bordered', 'material', 'material-white-padded']),
  startAdornment: PropTypes.element,
  largeLabel: PropTypes.bool,
  sx: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
}

export default TextField
