/* global importScripts */
/* eslint-disable import-x/unambiguous */
// Bundles are local and loaded synchronously so browser listeners are
// registered during service-worker startup. lockdown-install.js only installs
// SES; background.js locks down before running anything else.
importScripts('lockdown-install.js', 'background.js');
