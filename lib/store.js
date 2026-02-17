const Corestore = require('corestore')
const Hyperdrive = require('hyperdrive')
const debug = require('debug')('supernovao:store')

const DEFAULT_STORAGE = '.storage'

let _store = null

/**
 * Initialize the Corestore singleton.
 *
 * @param {string} [storagePath] — directory for RocksDB storage.
 *   Defaults to `.storage/` in the current working directory.
 * @returns {Corestore}
 */
function init(storagePath) {
  if (_store) return _store
  const dir = storagePath || DEFAULT_STORAGE
  debug('initializing corestore at %s', dir)
  _store = new Corestore(dir)
  return _store
}

/**
 * Get the current Corestore instance.
 * Calls init() with defaults if not yet initialized.
 *
 * @returns {Corestore}
 */
function getStore() {
  if (!_store) init()
  return _store
}

/**
 * Create or open a Hyperdrive.
 *
 * - Without a key: creates a new writable drive. The Corestore
 *   derives a deterministic keypair from the `name` parameter,
 *   so the same name always produces the same drive.
 *
 * - With a key: opens an existing drive for reading/replication.
 *   The drive will be sparse (default in Hyperdrive v13).
 *
 * @param {string} name — drive identifier (replaces old CFS `id`).
 *   Passed to Corestore as the core name for key derivation.
 * @param {string|Buffer|null} [key] — hex string or Buffer of
 *   the drive's public key. Omit for a new writable drive.
 * @returns {Promise<Hyperdrive>}
 */
async function getDrive(name, key) {
  const store = getStore()
  let drive

  if (key) {
    const keyBuf = Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex')
    debug('opening drive with key %s', keyBuf.toString('hex').slice(0, 8))
    drive = new Hyperdrive(store, keyBuf)
  } else {
    // Use a namespaced corestore so the `name` produces a
    // deterministic key unique to this application.
    const ns = store.namespace(name)
    debug('creating drive for name %s', name)
    drive = new Hyperdrive(ns)
  }

  await drive.ready()
  debug('drive ready — key=%s discoveryKey=%s',
    drive.key.toString('hex').slice(0, 8),
    drive.discoveryKey.toString('hex').slice(0, 8))
  return drive
}

/**
 * Close the Corestore and all drives.
 */
async function close() {
  if (_store) {
    debug('closing corestore')
    await _store.close()
    _store = null
  }
}

module.exports = { init, getStore, getDrive, close }
