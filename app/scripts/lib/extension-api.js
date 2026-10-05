import browserGlobal from './browser-global';

// The WebExtension API with promise-returning methods. webextension-polyfill
// throws outside an extension, so unit tests get an empty object to stub.
const nativeApi = browserGlobal.browser || browserGlobal.chrome;
const hasExtensionApi = Boolean(nativeApi?.runtime?.id);
const extension = hasExtensionApi ? require('webextension-polyfill') : {};

if (hasExtensionApi) {
  // Manifest V3 namespaces the polyfill does not wrap. Their methods return
  // promises natively when called without a callback.
  extension.action = extension.action || nativeApi.action;
  extension.offscreen = extension.offscreen || nativeApi.offscreen;
}

export default extension;
