const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { tmpDir, teardown } = require('./helpers')

describe('Peer', () => {
  let dir, drive

  before(async () => {
    const store = require('../lib/store')
    await store.close()
    dir = tmpDir()
    store.init(dir)
    drive = await store.getDrive('test-peer-drive')
  })

  after(async () => {
    await teardown(dir)
  })

  it('constructor sets initial state', () => {
    const Peer = require('../lib/peer')
    const peer = new Peer('abc123', drive)
    assert.strictEqual(peer.poolKey, 'abc123')
    assert.strictEqual(peer.drive, drive)
    assert.strictEqual(peer.swarm, null)
    assert.strictEqual(peer.topic, null)
    assert.deepStrictEqual(peer.segments.claimed, [])
    assert.deepStrictEqual(peer.segments.processing, [])
    assert.deepStrictEqual(peer.segments.done, [])
    assert.deepStrictEqual(peer.segments.delivered, [])
  })

  it('getSystemInfo returns JSON with peerInfo', async () => {
    const Peer = require('../lib/peer')
    const peer = new Peer('abc123', drive)
    const info = await peer.getSystemInfo()
    const parsed = JSON.parse(info)
    assert(parsed.peerInfo)
  })

  it('destroy is safe when no swarm', async () => {
    const Peer = require('../lib/peer')
    const peer = new Peer('abc123', drive)
    await peer.destroy()
    assert.strictEqual(peer.swarm, null)
  })

  it('is an EventEmitter', () => {
    const Peer = require('../lib/peer')
    const peer = new Peer('abc123', drive)
    assert.strictEqual(typeof peer.on, 'function')
    assert.strictEqual(typeof peer.emit, 'function')
  })
})
