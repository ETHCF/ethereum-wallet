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
        borderBottom: '2px solid #f7861c',
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
      color: '#aeaeae',
      '&.Mui-focused': {
        color: '#fff',
      },
      '& .MuiInputBase-input': {
        padding: '8px',
        '&::placeholder': {
          color: '#aeaeae',
        },
      },
      '&:after': {
        borderBottom: '2px solid #fff',
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
      border: '2px solid var(--color-border-default)',
      height: '48px',
      borderRadius: '6px',
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
}

export default TextField
