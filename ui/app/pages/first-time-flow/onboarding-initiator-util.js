import log from 'loglevel'
import extension from '../../../../app/scripts/lib/extension-api'

// Resolves with no tab if the tab is gone, logging the reason.
const withoutTab = (error) => {
  log.debug(error)
  return undefined
}

const returnToOnboardingInitiatorTab = async (onboardingInitiator) => {
  const tab = await extension.tabs.update(onboardingInitiator.tabId, { active: true }).catch(withoutTab)

  if (tab) {
    window.close()
  } else {
    // this case can happen if the tab was closed since being checked with `extension.tabs.get`
    log.warn(`Setting current tab to onboarding initiator has failed; falling back to redirect`)
    window.location.assign(onboardingInitiator.location)
  }
}

export const returnToOnboardingInitiator = async (onboardingInitiator) => {
  const tab = await extension.tabs.get(onboardingInitiator.tabId).catch(withoutTab)

  if (tab) {
    await returnToOnboardingInitiatorTab(onboardingInitiator)
  } else {
    window.location.assign(onboardingInitiator.location)
  }
}
