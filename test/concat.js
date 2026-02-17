const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { tmpDir, teardown, ASSETS } = require('./helpers')

describe('concat', () => {
  let dir, drive

  before(async () => {
    const store = require('../lib/store')
    await store.close()
    dir = tmpDir()
    store.init(dir)
    drive = await store.getDrive('test-concat')
    const write = require('../lib/write')
    await write(path.join(ASSETS, 'seg'), drive, 'sources')
  })

  after(async () => {
    await teardown(dir)
  })

  it('concatenates .264 files from drive directory', async () => {
    const concat = require('../lib/concat')
    const out = await concat(drive, '/sources')
    assert(out)
    assert(out.startsWith('/outputs/concats/concat_'))
    assert(out.endsWith('.264'))
  })

  it('produces non-empty output', async () => {
    const concat = require('../lib/concat')
    const out = await concat(drive, '/sources')
    const data = await drive.get(out)
    assert(data)
    assert(data.length > 0)
  })

  it('rejects when no .264 files', async () => {
    const concat = require('../lib/concat')
    await drive.put('/empty-dir/readme.txt', Buffer.from('not a segment'))
    await assert.rejects(() => concat(drive, '/empty-dir'), /No .264 files found/)
  })

  it('rejects on nonexistent directory', async () => {
    const concat = require('../lib/concat')
    await assert.rejects(() => concat(drive, '/nonexistent'))
  })
})
