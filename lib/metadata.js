const debug = require('debug')('supernovao:metadata')
const ffmpeg = require('fluent-ffmpeg')
const path = require('path')
const PATHS = require('./paths')

/**
 * Validate probed metadata against Supernovao requirements.
 *
 * @param {object} md — { format, video, tracks }
 * @returns {Promise<{format: boolean, video: boolean}>}
 */
function validate(md) {
  if (!md.video || !md.tracks || !md.format) {
    debug('rejecting video: bad metadata')
    throw new Error('Missing critical metadata!')
  }
  if (md.format.duration < 120) {
    debug('rejecting video: duration under 2 minutes')
    throw new Error('Video is too short! Cannot segment it')
  }
  if (path.extname(md.format.filename) === '.mkv') {
    debug('rejecting video: mkv format')
    throw new Error('Matroska is not supported. Please convert to MP4/MOV')
  }
  debug('video is valid')
  return {
    format: md.format.format_name.includes('mp4') || md.format.format_name.includes('mov'),
    video: md.video[0].codec_name === 'h264'
  }
}

/**
 * Probe a video file with ffprobe.
 *
 * @param {string} file — local filesystem path to the video
 * @returns {Promise<{format: object, video: object[], tracks: object[]}>}
 */
function probe(file) {
  return new Promise((resolve, reject) => {
    debug('ffprobe %s', file)
    ffmpeg(path.resolve(file)).ffprobe((err, md) => {
      if (err) return reject(err)
      try {
        const video = md.streams.filter(s => s.codec_type === 'video' && s.codec_name === 'h264')
        const tracks = md.streams.filter(s => s.codec_type !== 'data' && s.codec_name !== 'h264')
        resolve({ format: md.format, video, tracks })
      } catch (e) {
        reject(e)
      }
    })
  })
}

/**
 * Probe a video file, validate it, and write metadata to the drive.
 *
 * @param {string} file — local filesystem path to the video
 * @param {Hyperdrive} drive
 * @param {string} [writePath] — drive path for the metadata JSON
 * @returns {Promise<Map>} metadata map with 'metadata', 'valid', 'cfsPath' keys
 */
async function main(file, drive, writePath = PATHS.SOURCE_META) {
  const probeData = await probe(file)

  const mdMap = new Map()
  mdMap.set('metadata', probeData)

  const validation = validate(probeData)
  mdMap.set('valid', validation)
  mdMap.set('cfsPath', writePath)

  const jsonStr = JSON.stringify(probeData, null, 2)
  debug('writing metadata to %s', writePath)
  await drive.put(writePath, Buffer.from(jsonStr))

  return mdMap
}

module.exports = main
module.exports.validate = validate
module.exports.probe = probe
