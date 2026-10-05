/* global importScripts */
/* eslint-disable import/unambiguous */
// Bundles are local and loaded synchronously so browser listeners are
// registered during service-worker startup.
importScripts('lockdown-install.js', 'lockdown-run.js', 'lockdown-more.js', 'background.js')
