const fs = require('fs')
const os = require('os')
const path = require('path')
const { execSync } = require('child_process')

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'supernovao-test-'))
}

async function freshStore(storagePath) {
  const store = require('../lib/store')
  await store.close()
  store.init(storagePath)
  return store
}

async function teardown(storageDir) {
  const store = require('../lib/store')
  await store.close()
  if (storageDir && fs.existsSync(storageDir)) {
    fs.rmSync(storageDir, { recursive: true, force: true })
  }
}

function hasFFmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const ASSETS = path.resolve(__dirname, 'assets')

module.exports = { tmpDir, freshStore, teardown, hasFFmpeg, ASSETS }
