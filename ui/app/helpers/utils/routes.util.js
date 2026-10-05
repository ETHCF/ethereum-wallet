/**
 * Converts an absolute route into a path relative to a parent route, for
 * <Route>s nested in a component rendered by the parent's `${basePath}/*` route.
 *
 * @param {string} absolutePath - The full route (e.g. '/settings/general')
 * @param {string} [basePath] - The parent route to remove (e.g. '/settings')
 * @returns {string} The relative path (e.g. 'general'), or '/' for the parent itself
 */
export function toRelativeRoutePath(absolutePath, basePath = '') {
  const relativePath = absolutePath.replace(basePath, '').replace(/^\//u, '');
  return relativePath || '/';
}
