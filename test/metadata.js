const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { tmpDir, teardown, hasFFmpeg, ASSETS } = require('./helpers')

const ffmpegAvailable = hasFFmpeg()

describe('metadata', () => {
  describe('validate()', () => {
    const { validate } = require('../lib/metadata')
    const validMd = {
      format: { duration: 300, filename: 'test.mp4', format_name: 'mov,mp4,m4a,3gp' },
      video: [{ codec_name: 'h264' }],
      tracks: [{ codec_type: 'audio' }]
    }

    it('returns format and video booleans for valid metadata', () => {
      const r = validate(validMd)
      assert.strictEqual(r.format, true)
      assert.strictEqual(r.video, true)
    })

    it('throws on missing video', () => {
      assert.throws(
        () => validate({ format: validMd.format, tracks: validMd.tracks }),
        /Missing critical metadata/
      )
    })

    it('throws on missing format', () => {
      assert.throws(
        () => validate({ video: validMd.video, tracks: validMd.tracks }),
        /Missing critical metadata/
      )
    })

    it('throws on missing tracks', () => {
      assert.throws(
        () => validate({ format: validMd.format, video: validMd.video }),
        /Missing critical metadata/
      )
    })

    it('throws on duration < 120s', () => {
      assert.throws(
        () => validate({ ...validMd, format: { ...validMd.format, duration: 60 } }),
        /Video is too short/
      )
    })

    it('accepts exactly 120s', () => {
      assert(validate({ ...validMd, format: { ...validMd.format, duration: 120 } }))
    })

    it('throws on mkv', () => {
      assert.throws(
        () => validate({ ...validMd, format: { ...validMd.format, filename: 'video.mkv' } }),
        /Matroska/
      )
    })

    it('reports non-h264 as false', () => {
      const r = validate({ ...validMd, video: [{ codec_name: 'hevc' }] })
      assert.strictEqual(r.video, false)
    })

    it('reports non-mp4 format as false', () => {
      const r = validate({ ...validMd, format: { ...validMd.format, format_name: 'avi' } })
      assert.strictEqual(r.format, false)
    })
  })

  describe('probe()', { skip: !ffmpegAvailable }, () => {
    it('probes video file and returns structured metadata', async () => {
      const { probe } = require('../lib/metadata')
      const r = await probe(path.join(ASSETS, 'file.mp4'))
      assert(r.format)
      assert(Array.isArray(r.video))
      assert(Array.isArray(r.tracks))
    })

    it('rejects on nonexistent file', async () => {
      const { probe } = require('../lib/metadata')
      await assert.rejects(() => probe('/nonexistent/file.mp4'))
    })
  })

  describe('main()', { skip: !ffmpegAvailable }, () => {
    let dir, drive

    before(async () => {
      const store = require('../lib/store')
      await store.close()
      dir = tmpDir()
      store.init(dir)
      drive = await store.getDrive('test-metadata')
    })

    after(async () => {
      if (dir) await teardown(dir)
    })

    it('rejects on short test asset (< 120s)', async () => {
      const metadata = require('../lib/metadata')
      await assert.rejects(
        () => metadata(path.join(ASSETS, 'file.mp4'), drive),
        /Video is too short/
      )
    })
  })
})
