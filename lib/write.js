const debug = require('debug')('supernovao:write')
const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream/promises')

/**
 * Write a local file into a Hyperdrive.
 *
 * @param {string} filepath — local filesystem path
 * @param {Hyperdrive} drive
 * @param {string} [prefix=''] — drive directory prefix (e.g. 'segments/inputs')
 * @returns {Promise<string>} the drive path written to
 */
async function writeFile(filepath, drive, prefix = '') {
  const drivePath = prefix
    ? `/${prefix}/${path.basename(filepath)}`
    : `/${path.basename(filepath)}`

  debug('writing %s → %s', filepath, drivePath)

  const src = fs.createReadStream(path.resolve(filepath))
  const dst = drive.createWriteStream(drivePath)

  await pipeline(src, dst)
  return drivePath
}

/**
 * Write all files in a local directory into a Hyperdrive.
 *
 * @param {string} dirPath — local directory path
 * @param {Hyperdrive} drive
 * @param {string} [prefix=''] — drive directory prefix
 * @returns {Promise<string[]>} array of drive paths written
 */
async function writeDir(dirPath, drive, prefix = '') {
  const entries = await fs.promises.readdir(dirPath)
  const files = entries.map(e => path.resolve(dirPath, e))
  debug('dir files: %d entries', files.length)

  const results = []
  for (const f of files) {
    const stat = await fs.promises.stat(f)
    if (stat.isFile()) {
      const written = await writeFile(f, drive, prefix)
      results.push(written)
    }
  }
  return results
}

/**
 * Write a local file or directory into a Hyperdrive.
 *
 * @param {string} filepath — local file or directory path
 * @param {Hyperdrive} drive
 * @param {string} [prefix=''] — drive directory prefix
 * @returns {Promise<string|string[]>}
 */
async function main(filepath, drive, prefix = '') {
  const stats = await fs.promises.stat(filepath)
  if (stats.isDirectory()) {
    return writeDir(filepath, drive, prefix)
  }
  return writeFile(filepath, drive, prefix)
}

module.exports = main
