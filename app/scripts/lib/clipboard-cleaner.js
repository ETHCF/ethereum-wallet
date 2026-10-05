export const CLIPBOARD_CLEAR_ALARM = 'ecf-wallet-clear-clipboard';
export const CLIPBOARD_CLEAR_DELAY_MS = 60000;
export const CLEAR_CLIPBOARD_MESSAGE = 'ecf-wallet-clear-clipboard';
const OFFSCREEN_PATH = 'offscreen-clipboard.html';

/**
 * Clears copied secrets from the system clipboard. The service worker has no
 * clipboard access, so the work happens in a short-lived offscreen document,
 * which keeps running after the popup that copied the secret has closed.
 */
export default class ClipboardCleaner {
  constructor({
    extension,
    delayMs = CLIPBOARD_CLEAR_DELAY_MS,
    now = Date.now,
    wait = defaultWait,
  }) {
    this.extension = extension;
    this.delayMs = delayMs;
    this.now = now;
    this.wait = wait;
    this.operation = Promise.resolve();
  }

  schedule() {
    this.extension.alarms.create(CLIPBOARD_CLEAR_ALARM, {
      when: this.now() + this.delayMs,
    });
  }

  handleAlarm(alarm) {
    return alarm.name === CLIPBOARD_CLEAR_ALARM ? this.clear() : undefined;
  }

  /**
   * Clears the clipboard once any earlier clear finishes, and cancels the
   * scheduled clear.
   *
   * @returns {Promise<boolean>} Whether the clipboard was cleared.
   */
  clear() {
    this.extension.alarms.clear(CLIPBOARD_CLEAR_ALARM);
    const operation = this.operation
      .catch(() => undefined)
      .then(() => this._clear());
    this.operation = operation;
    return operation;
  }

  async _clear() {
    const { offscreen, runtime } = this.extension;
    if (!offscreen) {
      return false;
    }
    if (!(await offscreen.hasDocument())) {
      await offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['CLIPBOARD'],
        justification:
          'Clear a copied Secret Recovery Phrase or private key from the clipboard.',
      });
    }
    try {
      // The document's listener may not be registered the instant it is created.
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          return (
            (await runtime.sendMessage({ type: CLEAR_CLIPBOARD_MESSAGE })) ===
            true
          );
        } catch (error) {
          if (!/Receiving end does not exist/u.test(error.message)) {
            throw error;
          }
          await this.wait(50);
        }
      }
      return false;
    } finally {
      await offscreen.closeDocument().catch(() => undefined);
    }
  }
}

function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
