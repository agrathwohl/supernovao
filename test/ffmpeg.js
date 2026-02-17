const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { tmpDir } = require('./helpers')

const { parseEncodeSettings, translateSettings, createFFmpegOpts } = require('../lib/ffmpeg')

describe('ffmpeg', () => {
  describe('translateSettings()', () => {
    it('returns expected shape', () => {
      const r = translateSettings({ video: { bitrate: 5000, quality: 'high', codec: 'H264' } })
      assert.strictEqual(r.fps, 30)
      assert.strictEqual(r.bitrate, 5000)
      assert.strictEqual(r.quality, 'high')
      assert.strictEqual(r.codec, 'H264')
    })

    it('uses defaults for missing properties', () => {
      const r = translateSettings({ video: {} })
      assert.strictEqual(r.bitrate, 0)
      assert.strictEqual(r.quality, '')
      assert.strictEqual(r.codec, 'AVC')
    })
  })

  describe('createFFmpegOpts()', () => {
    it('returns input and output arrays', () => {
      const r = createFFmpegOpts({ fps: 30, bitrate: 5000 })
      assert(Array.isArray(r.opts.input))
      assert(Array.isArray(r.opts.output))
    })

    it('includes bitrate in output', () => {
      const r = createFFmpegOpts({ fps: 30, bitrate: 5000 })
      assert(r.opts.output.some(o => o.includes('5000')))
    })

    it('throws when bitrate is 0', () => {
      assert.throws(() => createFFmpegOpts({ fps: 30, bitrate: 0 }), /Missing values/)
    })

    it('throws when fps is 0', () => {
      assert.throws(() => createFFmpegOpts({ fps: 0, bitrate: 5000 }), /Missing values/)
    })
  })

  describe('parseEncodeSettings()', () => {
    it('parses valid JSON file', async () => {
      const d = tmpDir()
      const f = path.join(d, 'encode.json')
      fs.writeFileSync(f, JSON.stringify({ video: { bitrate: 5000 } }))
      try {
        const r = await parseEncodeSettings(f)
        assert.deepStrictEqual(r, { video: { bitrate: 5000 } })
      } finally {
        fs.rmSync(d, { recursive: true, force: true })
      }
    })

    it('rejects on invalid JSON', async () => {
      const d = tmpDir()
      const f = path.join(d, 'bad.json')
      fs.writeFileSync(f, '{nope}')
      try {
        await assert.rejects(() => parseEncodeSettings(f))
      } finally {
        fs.rmSync(d, { recursive: true, force: true })
      }
    })

    it('rejects on missing file', async () => {
      await assert.rejects(() => parseEncodeSettings('/nonexistent'))
    })
  })
})
