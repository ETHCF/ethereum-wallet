import extension from 'extensionizer'
import { createHardwareRequestHandler } from './lib/hardware-transport'

const performRequest = createHardwareRequestHandler()
const backgroundUrls = new Set([
  extension.runtime.getURL('service-worker.js'),
  extension.runtime.getURL('_generated_background_page.html'),
])

extension.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'metamask-hardware-request' || sender.id !== extension.runtime.id || sender.tab ||
      !backgroundUrls.has(sender.url)) {
    return false
  }
  performRequest(message).then(respond, (error) => respond({ error: error.message }))
  return true
})
