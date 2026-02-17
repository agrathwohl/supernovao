const { release, platform } = require('os')
const fs = require('fs')
const crypto = require('crypto')
const debug = require('debug')('supernovao:util')

const PATHS = require('./paths')

/**
 * Get current Unix timestamp in seconds.
 */
function epoch() {
  return Math.floor(Date.now() / 1000)
}

/**
 * Get OS platform and release.
 */
function getOs() {
  return [platform() || '', release() || '']
}

/**
 * Get non-video, non-data track filenames from the drive.
 *
 * @param {Hyperdrive} drive
 * @returns {Promise<string[]>}
 */
async function getTracks(drive) {
  const tracks = []
  for await (const name of drive.readdir(PATHS.TRACKS_IN)) {
    if (!name.includes('video') && !name.includes('data')) {
      tracks.push(name)
    }
  }
  return tracks
}

/**
 * Generate a worker identity from a peer's host:port.
 *
 * @param {{ host: string, port: number }} peer
 * @returns {Promise<{ id: string, secret: string }>}
 */
async function getWorkerKeyPair(peer) {
  const workerId = crypto.createHash('sha256')
    .update(`${peer.host}:${peer.port}`)
    .digest()
    .toString('hex')
  const workerSecret = crypto.randomBytes(16).toString('hex')

  await fs.promises.writeFile('.worker', `${workerId}|${workerSecret}`)
  return { id: workerId, secret: workerSecret }
}

module.exports = { epoch, getOs, getTracks, getWorkerKeyPair }
