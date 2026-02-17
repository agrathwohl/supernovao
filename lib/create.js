const debug = require('debug')('supernovao:create')
const { getDrive } = require('./store')
const PATHS = require('./paths')

/**
 * Supernovao drive layout
 * -----------------------
 *
 * /config             - Drive configuration files
 * /metadata           - Video metadata (source.json, etc.)
 * /participants       - Pool participant records
 * /sources            - Source video files
 * /segments/inputs    - Source segments (pre-encode)
 * /segments/outputs   - Encoded segments (post-encode)
 * /tracks/inputs      - Demuxed input tracks
 * /tracks/outputs     - Processed output tracks
 * /outputs/concats    - Concatenated segment files
 * /outputs/muxes      - Final muxed output files
 * /supernovao-profile - Profile marker ('pool' or 'work')
 *
 * Directories are implicit in Hyperdrive — they exist
 * when files exist under them. No mkdir needed.
 */

/**
 * Create or open a Supernovao drive and write its profile marker.
 *
 * @param {string} id — drive identifier (e.g. "supernovao/pool", "test/test")
 * @param {string|Buffer|null} [key] — public key to open existing drive
 * @param {string} [prof='pool'] — profile type ('pool' or 'work')
 * @returns {Promise<Hyperdrive>}
 */
async function create(id, key, prof = 'pool') {
  const drive = await getDrive(id, key)
  debug('drive %s key=%s', id, drive.key.toString('hex').slice(0, 8))

  // Write profile marker if this drive is writable
  if (drive.writable) {
    await drive.put(PATHS.PROFILE, Buffer.from(prof))
    debug('wrote profile: %s', prof)
  }

  return drive
}

module.exports = create
