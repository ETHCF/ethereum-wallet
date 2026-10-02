import { THEME_TYPES } from '../constants/themes'

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

/**
 * Resolves the user's theme preference to a concrete light or dark theme.
 *
 * @param {string} theme - The theme preference: light, dark or os.
 * @returns {string} The theme to apply, light or dark.
 */
export function getResolvedTheme (theme) {
  if (theme === THEME_TYPES.LIGHT || theme === THEME_TYPES.DARK) {
    return theme
  }
  return window.matchMedia?.(DARK_SCHEME_QUERY).matches ? THEME_TYPES.DARK : THEME_TYPES.LIGHT
}

/**
 * Applies the theme to the document via the `data-theme` attribute on `<html>`.
 *
 * @param {string} theme - The theme preference: light, dark or os.
 */
export function applyTheme (theme) {
  document.documentElement.dataset.theme = getResolvedTheme(theme)
}

/**
 * Calls the listener when the operating system's color scheme changes.
 *
 * @param {Function} listener - Called with no arguments on change.
 * @returns {Function} Removes the listener.
 */
export function onSystemThemeChange (listener) {
  const mediaQuery = window.matchMedia?.(DARK_SCHEME_QUERY)
  if (!mediaQuery) {
    return () => undefined
  }
  mediaQuery.addEventListener('change', listener)
  return () => mediaQuery.removeEventListener('change', listener)
}
