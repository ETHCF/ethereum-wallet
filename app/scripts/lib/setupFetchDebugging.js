import browserGlobal from './browser-global'
//
// This is a utility to help resolve cases where `browserGlobal.fetch` throws a
// `TypeError: Failed to Fetch` without any stack or context for the request
//

export default function setupFetchDebugging () {
  if (!browserGlobal.fetch) {
    return
  }
  const originalFetch = browserGlobal.fetch

  browserGlobal.fetch = wrappedFetch

  async function wrappedFetch (...args) {
    const initialStack = getCurrentStack()
    try {
      return await originalFetch.call(browserGlobal, ...args)
    } catch (err) {
      if (!err.stack) {
        console.warn('FetchDebugger - fetch encountered an Error without a stack', err)
        console.warn('FetchDebugger - overriding stack to point of original call')
        err.stack = initialStack
      }
      throw err
    }
  }
}

function getCurrentStack () {
  try {
    throw new Error('Fake error for generating stack trace')
  } catch (err) {
    return err.stack
  }
}
