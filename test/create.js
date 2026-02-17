const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { tmpDir, teardown } = require('./helpers')
const PATHS = require('../lib/paths')

describe('create', () => {
  let dir

  before(async () => {
    const store = require('../lib/store')
    await store.close()
    dir = tmpDir()
    store.init(dir)
  })

  after(async () => {
    await teardown(dir)
  })

  it('creates a Hyperdrive with 32-byte key', async () => {
    const create = require('../lib/create')
    const drive = await create('test/basic', null)
    assert(drive.key)
    assert.strictEqual(drive.key.length, 32)
  })

  it('returns a writable drive', async () => {
    const create = require('../lib/create')
    const drive = await create('test/writable', null)
    assert(drive.writable)
  })

  it('writes default "pool" profile', async () => {
    const create = require('../lib/create')
    const drive = await create('test/default-prof', null)
    const data = await drive.get(PATHS.PROFILE)
    assert.strictEqual(data.toString(), 'pool')
  })

  it('writes custom profile', async () => {
    const create = require('../lib/create')
    const drive = await create('test/custom-prof', null, 'work')
    const data = await drive.get(PATHS.PROFILE)
    assert.strictEqual(data.toString(), 'work')
  })
})
