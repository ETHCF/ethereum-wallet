/**
 * Replaces the clipboard contents with an empty string, from a document that
 * may use the clipboard: Chrome's offscreen document or Firefox's background
 * page.
 *
 * @param {Document} doc - The document to copy from.
 * @returns {boolean} Whether the clipboard was replaced.
 */
export function clearClipboardInDocument(doc) {
  const replace = (event) => {
    event.clipboardData.setData('text/plain', '');
    event.preventDefault();
  };
  doc.addEventListener('copy', replace);
  try {
    return doc.execCommand('copy');
  } finally {
    doc.removeEventListener('copy', replace);
  }
}
