const { Transform } = require('stream')
const { minify } = require('terser')

/**
 * Minifies each Vinyl file with Terser 5, composing with the source map that
 * gulp-sourcemaps attached upstream. Replaces gulp-terser-js, whose Terser 4
 * cannot parse optional chaining or nullish coalescing.
 *
 * @param {Object} [options] - Terser minify options
 * @returns {Transform} An object-mode stream of Vinyl files
 */
module.exports = function terserStream (options = {}) {
  return new Transform({
    objectMode: true,
    transform (file, _, callback) {
      if (file.isNull()) {
        callback(null, file)
        return
      }
      const inputMap = file.sourceMap
      minify({ [file.relative]: file.contents.toString() }, {
        ...options,
        sourceMap: inputMap ? { content: inputMap } : false,
      }).then((result) => {
        file.contents = Buffer.from(result.code)
        if (inputMap) {
          const map = JSON.parse(result.map)
          map.file = inputMap.file
          file.sourceMap = map
        }
        callback(null, file)
      }, (error) => {
        callback(new Error(`terser: ${file.relative}: ${error.message} (line ${error.line}, col ${error.col})`))
      })
    },
  })
}
