import extension from 'extensionizer'
import browserGlobal from './browser-global'

// extensionizer predates Manifest V3 and does not expose these namespaces.
const nativeApi = browserGlobal.chrome || browserGlobal.browser || {}
extension.action = nativeApi.action || extension.browserAction
extension.offscreen = nativeApi.offscreen

export default extension
