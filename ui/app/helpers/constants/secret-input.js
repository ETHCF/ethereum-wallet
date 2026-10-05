// For fields that take a seed phrase or other secret. Spell checkers, Chrome's
// enhanced spell check among them, may send the text they check off the
// device, and autocomplete may store it.
export const SECRET_INPUT_PROPS = {
  spellCheck: false,
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
};
