// Browserify's global resolves to self in a worker and window in a document.
const browserGlobal = typeof window === 'undefined' ? global : window

export default browserGlobal
