const debug = require('debug')('supernovao:vmaf')
const ffmpeg = require('fluent-ffmpeg')

/**
 * Check whether FFmpeg has libvmaf filter compiled in.
 *
 * @returns {Promise<{libvmaf: boolean}>}
 */
function checkForVmaf() {
  return new Promise((resolve, reject) => {
    ffmpeg.getAvailableFilters((err, filters) => {
      if (err) return reject(err)
      resolve({ libvmaf: Object.keys(filters).includes('libvmaf') })
    })
  })
}

/**
 * Run VMAF quality comparison between source and encoded video.
 *
 * @param {string} src — local path to source video
 * @param {string} enc — local path to encoded video
 * @returns {Promise<string|null>} VMAF score or null
 */
function runVmaf(src, enc) {
  return new Promise((resolve, reject) => {
    let score = null
    ffmpeg(src)
      .input(enc)
      .outputOptions([
        '-lavfi libvmaf=ms_ssim=1:log_fmt=json',
        '-f null'
      ])
      .output('/dev/null')
      .on('stderr', (line) => {
        if (line.includes('VMAF score:')) {
          score = line.split(': ')[1]
          debug('VMAF score: %s', score)
        }
      })
      .on('error', err => reject(err))
      .on('end', () => resolve(score))
      .run()
  })
}

module.exports = { runVmaf, checkForVmaf }
