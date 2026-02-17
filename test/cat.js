const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { tmpDir, teardown, ASSETS } = require('./helpers')

describe('cat', () => {
  let dir, drive

  before(async () => {
    const store = require('../lib/store')
    await store.close()
    dir = tmpDir()
    store.init(dir)
    drive = await store.getDrive('test-cat')
    const write = require('../lib/write')
    await write(path.join(ASSETS, 'testText'), drive)
  })

  after(async () => {
    await teardown(dir)
  })

  it('resolves without error for existing file', async () => {
    const cat = require('../lib/cat')
    await cat('/testText', drive)
  })

  it('rejects on missing file', async () => {
    const cat = require('../lib/cat')
    await assert.rejects(() => cat('/nonexistent', drive))
  })
})
