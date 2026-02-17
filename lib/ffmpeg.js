const debug = require('debug')('supernovao:ffmpeg')
const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const os = require('os')
const path = require('path')
const pino = require('pino')

const logger = pino({ name: 'encode-progress' })

/**
 * Parse encode settings from a local JSON file.
 */
async function parseEncodeSettings(encodeFile) {
  const data = await fs.promises.readFile(encodeFile, 'utf8')
  const settings = JSON.parse(data)
  debug('encode settings: %o', settings)
  return settings
}

/**
 * Translate encode settings into FFmpeg-friendly values.
 */
function translateSettings(settings) {
  return {
    fps: 30,
    width: 0,
    height: 0,
    bitrate: settings.video.bitrate || 0,
    quality: settings.video.quality || '',
    codec: settings.video.codec || 'AVC'
  }
}

/**
 * Build FFmpeg input/output option arrays from translated settings.
 */
function createFFmpegOpts(translated) {
  if (!translated.fps || !translated.bitrate) {
    throw new Error('Missing values in FFmpeg command translation')
  }
  return {
    opts: {
      input: [`-framerate ${translated.fps || 30}`],
      output: [`-b:v ${translated.bitrate}k`, `-r ${translated.fps || 30}`]
    }
  }
}

/**
 * Encode a single video segment using FFmpeg.
 *
 * @param {string} segmentPath — local path to the segment file
 * @param {object} settings — { opts: { input: [], output: [] } }
 * @returns {Promise<string>} path to the encoded output
 */
function encode(segmentPath, settings) {
  return new Promise((resolve, reject) => {
    const outPath = `${os.tmpdir()}/${path.basename(segmentPath)}`
    ffmpeg(segmentPath)
      .inputOptions(settings.opts.input)
      .output(outPath)
      .outputOptions(settings.opts.output)
      .on('start', cmd => debug(cmd))
      .on('progress', prog => logger.info(prog))
      .on('error', err => reject(err))
      .on('end', () => resolve(outPath))
      .run()
  })
}

/**
 * Read encode settings and encode a segment.
 *
 * @param {string} encodeJson — path to local encode settings JSON
 * @param {string} segmentPath — path to local segment file
 * @returns {Promise<string>} path to encoded output
 */
async function main(encodeJson, segmentPath) {
  const raw = await parseEncodeSettings(encodeJson)
  const translated = translateSettings(raw)
  debug('translated settings: %o', translated)
  const ffCmd = createFFmpegOpts(translated)
  const result = await encode(segmentPath, ffCmd)
  debug('finished encode: %s', result)
  return result
}

module.exports = main
module.exports.parseEncodeSettings = parseEncodeSettings
module.exports.translateSettings = translateSettings
module.exports.createFFmpegOpts = createFFmpegOpts
