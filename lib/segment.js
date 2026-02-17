const debug = require('debug')('supernovao:segment')
const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PATHS = require('./paths')
const write = require('./write')

/**
 * Determine the FPS of a local video file via ffprobe.
 */
function getFPS(localFile) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(localFile, (err, md) => {
      if (err) return reject(err)
      try {
        const [num, den] = md.streams
          .filter(s => s.codec_type === 'video')[0]
          .r_frame_rate.split('/')
        debug('fps: %s/%s', num, den)
        resolve(parseFloat((num / den).toFixed(3)))
      } catch (e) {
        reject(e)
      }
    })
  })
}

/**
 * Clear existing input segments from the drive.
 */
async function clearSegDir(drive) {
  const existing = []
  for await (const name of drive.readdir(PATHS.SEGMENTS_IN)) {
    existing.push(name)
  }
  if (!existing.length) {
    debug('segment directory empty, nothing to clear')
    return
  }
  for (const name of existing) {
    await drive.del(`${PATHS.SEGMENTS_IN}/${name}`)
  }
  debug('cleared %d segments from drive', existing.length)
}

/**
 * Segment a video file into ~30s keyframe-aligned chunks and
 * write the segments into the drive.
 *
 * @param {string} localFile — path to the source video on local FS
 * @param {Hyperdrive} drive
 * @param {string} temp — temp directory path
 * @returns {Promise<[string[], string]>} [drive paths written, temp folder]
 */
async function segment(localFile, drive, temp) {
  await clearSegDir(drive)
  const fps = await getFPS(localFile)

  const folderPath = path.join(temp, 'segments')
  await fs.promises.mkdir(folderPath, { recursive: true })

  // FFmpeg logs go to local FS, not the drive
  const logPath = path.join(temp, 'ffmpeg_segment.log')
  const logStream = fs.createWriteStream(logPath, { flags: 'a' })

  return new Promise((resolve, reject) => {
    ffmpeg(localFile)
      .inputFPS(fps)
      .inputOptions([
        '-probesize 500M',
        '-analyzeduration 1000M'
      ])
      .output(`${folderPath}/segment%05d.264`)
      .outputOptions([
        '-c:v:0', 'copy',
        '-sn', '-an', '-dn',
        '-map', '0:v:0',
        '-segment_time', '30',
        '-f', 'segment',
        '-break_non_keyframes', '0'
      ])
      .on('start', cmd => debug(cmd))
      .on('error', err => reject(err))
      .on('stderr', (line) => {
        debug(line)
        logStream.write(line + '\n')
      })
      .on('end', async () => {
        logStream.end()
        try {
          const dirFiles = await fs.promises.readdir(folderPath)
          debug('segmented into %d files', dirFiles.length)
          const written = await Promise.all(
            dirFiles.map(f => write(`${folderPath}/${f}`, drive, 'segments/inputs'))
          )
          resolve([written, folderPath])
        } catch (e) {
          reject(e)
        }
      })
      .run()
  })
}

module.exports = segment
