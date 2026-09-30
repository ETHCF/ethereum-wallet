/* global importScripts */
/* eslint-disable import/unambiguous */
// Both bundles are local and loaded synchronously so browser listeners are
// registered during service-worker startup.
importScripts('transaction-codec.js', 'bg-libs.js', 'background.js')
