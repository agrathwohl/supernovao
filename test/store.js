const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { tmpDir, teardown } = require('./helpers')

describe('store', () => {
  let dir

  before(async () => {
    const store = require('../lib/store')
    await store.close()
    dir = tmpDir()
  })

  after(async () => {
    await teardown(dir)
  })

  it('init creates a corestore instance', () => {
    const store = require('../lib/store')
    assert(store.init(dir))
  })

  it('init returns same instance on second call', () => {
    const store = require('../lib/store')
    const s = store.init(dir + '-ignored')
    assert(s)
  })

  it('getStore returns the instance after init', () => {
    const store = require('../lib/store')
    assert(store.getStore())
  })

  it('getDrive returns a Hyperdrive with 32-byte key', async () => {
    const store = require('../lib/store')
    const drive = await store.getDrive('test-drive')
    assert(drive.key)
    assert.strictEqual(drive.key.length, 32)
  })

  it('getDrive returns writable drive without key', async () => {
    const store = require('../lib/store')
    const drive = await store.getDrive('test-writable')
    assert(drive.writable)
  })

  it('getDrive key is 64-char hex', async () => {
    const store = require('../lib/store')
    const drive = await store.getDrive('test-hex')
    assert.strictEqual(drive.key.toString('hex').length, 64)
  })
})
