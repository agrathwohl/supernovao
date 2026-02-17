const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { tmpDir, teardown } = require('./helpers')

describe('Pool', () => {
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

  it('constructor sets initial state', () => {
    const Pool = require('../lib/pool')
    const pool = new Pool('test/pool', null)
    assert.strictEqual(pool.id, 'test/pool')
    assert.strictEqual(pool.drive, null)
    assert.deepStrictEqual(pool.segments, [])
    assert.deepStrictEqual(pool.segmentsAvailable, [])
    assert.deepStrictEqual(pool.segmentsClaimed, [])
    assert.deepStrictEqual(pool.segmentsComplete, [])
    assert(pool.creationDate > 0)
  })

  it('createPoolDrive returns a writable Hyperdrive', async () => {
    const Pool = require('../lib/pool')
    const pool = new Pool('test/pool-drive', null)
    const drive = await pool.createPoolDrive()
    assert(drive.key)
    assert.strictEqual(drive.key.length, 32)
    assert(drive.writable)
  })

  it('loadConfig loads tracks and segments from drive', async () => {
    const Pool = require('../lib/pool')
    const pool = new Pool('test/pool-config', null)
    await pool.createPoolDrive()
    await pool.drive.put('/config/tracks.json', Buffer.from(JSON.stringify([{ codec: 'h264' }])))
    await pool.drive.put('/config/segments.json', Buffer.from(JSON.stringify(['/seg/a.ts', '/seg/b.ts'])))
    await pool.loadConfig()
    assert.strictEqual(pool.tracks.length, 1)
    assert.strictEqual(pool.segments.length, 2)
    assert.strictEqual(pool.segmentsAvailable.length, 2)
    assert.strictEqual(pool.ready, true)
  })

  it('loadConfig sets ready=false with no config', async () => {
    const Pool = require('../lib/pool')
    const pool = new Pool('test/pool-empty', null)
    await pool.createPoolDrive()
    await pool.loadConfig()
    assert.strictEqual(pool.ready, false)
  })

  it('assignSegment pops from available and pushes to claimed', async () => {
    const Pool = require('../lib/pool')
    const pool = new Pool('test/pool-assign', null)
    await pool.createPoolDrive()
    await pool.drive.put('/config/tracks.json', Buffer.from(JSON.stringify([])))
    await pool.drive.put('/config/segments.json', Buffer.from(JSON.stringify(['/a', '/b', '/c'])))
    await pool.loadConfig()
    const seg = pool.assignSegment()
    assert(seg)
    assert.strictEqual(pool.segmentsAvailable.length, 2)
    assert.strictEqual(pool.segmentsClaimed.length, 1)
  })

  it('assignSegment returns null when empty', async () => {
    const Pool = require('../lib/pool')
    const pool = new Pool('test/pool-exhaust', null)
    await pool.createPoolDrive()
    await pool.drive.put('/config/tracks.json', Buffer.from(JSON.stringify([])))
    await pool.drive.put('/config/segments.json', Buffer.from(JSON.stringify(['/only'])))
    await pool.loadConfig()
    pool.assignSegment()
    assert.strictEqual(pool.assignSegment(), null)
  })

  it('checkCompletion returns null when incomplete', async () => {
    const Pool = require('../lib/pool')
    const pool = new Pool('test/pool-check', null)
    await pool.createPoolDrive()
    await pool.drive.put('/config/tracks.json', Buffer.from(JSON.stringify([])))
    await pool.drive.put('/config/segments.json', Buffer.from(JSON.stringify(['/seg/a.ts', '/seg/b.ts'])))
    await pool.loadConfig()
    pool.segmentsComplete.push('/segments/outputs/a.ts')
    const result = await pool.checkCompletion()
    assert.strictEqual(result, null)
  })

  it('destroy clears swarm ref', async () => {
    const Pool = require('../lib/pool')
    const pool = new Pool('test/pool-destroy', null)
    await pool.createPoolDrive()
    await pool.destroy()
    assert.strictEqual(pool.swarm, null)
  })
})
