const debug = require('debug')('supernovao:cat')
const { pipeline } = require('stream/promises')

/**
 * Stream a drive file to stdout.
 *
 * @param {string} filePath — path within the Hyperdrive
 * @param {Hyperdrive} drive
 */
async function main(filePath, drive) {
  debug('cat %s from drive %s', filePath, drive.key.toString('hex').slice(0, 8))
  await pipeline(drive.createReadStream(filePath), process.stdout)
}

module.exports = main
