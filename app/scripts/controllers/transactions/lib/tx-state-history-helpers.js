import { applyPatch, compare } from 'fast-json-patch';
import { cloneDeep } from 'lodash';

/**
 * Generates an array of history objects sense the previous state.
 * The object has the keys
 * op (the operation performed),
 * path (the key and if a nested object then each key will be separated with a `/`)
 * value
 * with the first entry having the note and a timestamp when the change took place
 *
 * @param {object} previousState - the previous state of the object
 * @param {object} newState - the update object
 * @param {string} [note] - a optional note for the state change
 * @returns {Array<object>} The JSON Patch operations from the previous state
 * to the new state.
 */
export function generateHistoryEntry(previousState, newState, note) {
  const entry = compare(previousState, newState);
  // Add a note to the first op, since it breaks if we append it to the entry
  if (entry[0]) {
    if (note) {
      entry[0].note = note;
    }

    entry[0].timestamp = Date.now();
  }
  return entry;
}

/**
 * Recovers previous txMeta state obj
 *
 * @param {Array} _shortHistory - The txMeta history: an initial snapshot
 * followed by arrays of JSON Patch operations.
 * @returns {object} The txMeta state after applying every history entry.
 */
export function replayHistory(_shortHistory) {
  const shortHistory = cloneDeep(_shortHistory);
  return shortHistory.reduce(
    (val, entry) => applyPatch(val, entry).newDocument,
  );
}

/**
 * Snapshot {@code txMeta}
 *
 * @param {object} txMeta - the tx metadata object
 * @returns {object} a deep clone without history
 */
export function snapshotFromTxMeta(txMeta) {
  const shallow = { ...txMeta };
  delete shallow.history;
  return cloneDeep(shallow);
}
