const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { tmpDir, teardown } = require('./helpers')
const PATHS = require('../lib/paths')
const util = require('../lib/util')

describe('util', () => {
  describe('epoch()', () => {
    it('returns a number', () => {
      assert.strictEqual(typeof util.epoch(), 'number')
    })

    it('returns current unix timestamp within 2s', () => {
      const now = Math.floor(Date.now() / 1000)
      assert(Math.abs(util.epoch() - now) < 2)
    })

    it('returns an integer', () => {
      const r = util.epoch()
      assert.strictEqual(r, Math.floor(r))
    })
  })

  describe('getOs()', () => {
    it('returns two-element array', () => {
      const r = util.getOs()
      assert(Array.isArray(r))
      assert.strictEqual(r.length, 2)
    })

    it('returns non-empty platform string', () => {
      const [p] = util.getOs()
      assert.strictEqual(typeof p, 'string')
      assert(p.length > 0)
    })
  })

  describe('getTracks()', () => {
    let dir, drive

    before(async () => {
      const store = require('../lib/store')
      await store.close()
      dir = tmpDir()
      store.init(dir)
      drive = await store.getDrive('test-util-tracks')
      await drive.put(`${PATHS.TRACKS_IN}/track_0_video.mp4`, Buffer.from('video'))
      await drive.put(`${PATHS.TRACKS_IN}/track_1_audio.mp4`, Buffer.from('audio'))
      await drive.put(`${PATHS.TRACKS_IN}/track_2_audio.mp4`, Buffer.from('audio2'))
      await drive.put(`${PATHS.TRACKS_IN}/track_3_data.mp4`, Buffer.from('data'))
      await drive.put(`${PATHS.TRACKS_IN}/track_4_subtitle.mp4`, Buffer.from('sub'))
    })

    after(async () => {
      await teardown(dir)
    })

    it('excludes video and data tracks', async () => {
      const tracks = await util.getTracks(drive)
      for (const t of tracks) {
        assert(!t.includes('video'))
        assert(!t.includes('data'))
      }
    })

    it('includes audio and subtitle tracks', async () => {
      const tracks = await util.getTracks(drive)
      assert(tracks.some(t => t.includes('audio')))
      assert(tracks.some(t => t.includes('subtitle')))
    })

    it('returns correct count', async () => {
      const tracks = await util.getTracks(drive)
      assert.strictEqual(tracks.length, 3)
    })
  })

  describe('getWorkerKeyPair()', () => {
    let testDir, origDir

    before(() => {
      origDir = process.cwd()
      testDir = tmpDir()
      process.chdir(testDir)
    })

    after(() => {
      process.chdir(origDir)
      fs.rmSync(testDir, { recursive: true, force: true })
    })

    it('returns id and secret', async () => {
      const r = await util.getWorkerKeyPair({ host: '127.0.0.1', port: 3000 })
      assert(r.id)
      assert(r.secret)
    })

    it('id is 64-char hex', async () => {
      const r = await util.getWorkerKeyPair({ host: '10.0.0.1', port: 8080 })
      assert.strictEqual(r.id.length, 64)
    })

    it('secret is 32-char hex', async () => {
      const r = await util.getWorkerKeyPair({ host: '10.0.0.1', port: 9090 })
      assert.strictEqual(r.secret.length, 32)
    })

    it('writes .worker file', async () => {
      const r = await util.getWorkerKeyPair({ host: '192.168.1.1', port: 5555 })
      const content = fs.readFileSync('.worker', 'utf8')
      const [id, secret] = content.split('|')
      assert.strictEqual(id, r.id)
      assert.strictEqual(secret, r.secret)
    })

    it('deterministic id for same host:port', async () => {
      const r1 = await util.getWorkerKeyPair({ host: '1.2.3.4', port: 1234 })
      const r2 = await util.getWorkerKeyPair({ host: '1.2.3.4', port: 1234 })
      assert.strictEqual(r1.id, r2.id)
    })
  })
})
