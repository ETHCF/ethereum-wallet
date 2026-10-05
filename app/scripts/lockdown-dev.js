/* global lockdown */
/* eslint-disable import-x/unambiguous */
// Development builds run without LavaMoat, which otherwise locks down the
// bundle, so they call lockdown here, before any other module.
// If it throws, the bundle stops: development builds should fail the same
// way release builds would (see lockdown-more.js).
lockdown(process.env.LOCKDOWN_OPTIONS);
