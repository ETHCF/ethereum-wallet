/* global importScripts */
/* eslint-disable import/unambiguous */
// Bundles are local and loaded synchronously so browser listeners are
// registered during service-worker startup.
importScripts('transaction-codec.js', 'background.js')
