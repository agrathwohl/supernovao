const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { tmpDir, teardown, ASSETS } = require('./helpers')

describe('write', () => {
  let dir, drive

  before(async () => {
    const store = require('../lib/store')
    await store.close()
    dir = tmpDir()
    store.init(dir)
    drive = await store.getDrive('test-write')
  })

  after(async () => {
    await teardown(dir)
  })

  it('writes a single file to drive root', async () => {
    const write = require('../lib/write')
    const p = await write(path.join(ASSETS, 'testText'), drive)
    assert.strictEqual(p, '/testText')
    const data = await drive.get(p)
    assert(data)
    assert.strictEqual(data.length, 35)
  })

  it('writes a file with prefix', async () => {
    const write = require('../lib/write')
    const p = await write(path.join(ASSETS, 'testText'), drive, 'sources')
    assert.strictEqual(p, '/sources/testText')
    const data = await drive.get(p)
    assert.strictEqual(data.length, 35)
  })

  it('writes directory contents', async () => {
    const write = require('../lib/write')
    const results = await write(path.join(ASSETS, 'seg'), drive, 'segments')
    assert(Array.isArray(results))
    assert.strictEqual(results.length, 3)
    for (const p of results) {
      assert(p.startsWith('/segments/'))
      assert(p.endsWith('.264'))
    }
  })

  it('writes with deep prefix', async () => {
    const write = require('../lib/write')
    const p = await write(path.join(ASSETS, 'testText'), drive, 'deep/nested')
    assert.strictEqual(p, '/deep/nested/testText')
    assert(await drive.get(p))
  })
})
