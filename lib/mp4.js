const debug = require('debug')('supernovao:mp4')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegOnProgress = require('ffmpeg-on-progress')
const fs = require('fs')
const os = require('os')
const path = require('path')
const pino = require('pino')

const PATHS = require('./paths')
const metadata = require('./metadata')
const util = require('./util')
const write = require('./write')

const logger = pino({ name: 'progress' })

function logProgress(progress, event) {
  logger.info({
    progress: (progress * 100).toFixed(),
    timemark: event.timemark
  })
}

/**
 * Get metadata for a demuxed track by parsing its filename.
 *
 * Track files are named like: track_1_audio.mp4
 * The number is the stream index from the source.
 */
async function getMetadataByTrackId(drive, trackName) {
  const id = parseInt(path.basename(trackName).split('_')[1], 10)
  const sourceMeta = await drive.get(PATHS.SOURCE_META)
  const allMeta = JSON.parse(sourceMeta.toString())

  return {
    base: path.basename(trackName),
    metadata: allMeta.tracks.filter(t => t.index === id)[0],
    reader: drive.createReadStream(`${PATHS.TRACKS_IN}/${trackName}`),
    id
  }
}

/**
 * Pull demuxed source tracks from the drive to a local temp dir
 * so FFmpeg can read them as local files.
 */
async function pullStems(drive, stems, temp) {
  const folder = fs.mkdtempSync(`${temp || os.tmpdir()}${path.sep}stems-`)
  const stemData = await Promise.all(
    stems.map(st => getMetadataByTrackId(drive, st))
  )
  debug('pulling %d stems to %s', stemData.length, folder)

  // Write each stem from drive to local filesystem
  for (const stem of stemData) {
    await new Promise((resolve, reject) => {
      const dst = fs.createWriteStream(`${folder}/${stem.base}`)
      dst.on('error', reject)
      dst.on('finish', resolve)
      stem.reader.on('error', reject)
      stem.reader.pipe(dst)
    })
  }

  return [stemData, folder]
}

/**
 * Demux an MP4 file into separate tracks and write them to the drive.
 *
 * @param {Hyperdrive} drive
 * @param {string} mp4File — local path to the MP4 source
 * @param {string|null} temp — temp directory
 * @returns {Promise<string[]|false>} drive paths of written tracks, or false if no tracks
 */
async function demux(drive, mp4File, temp) {
  const sourceMeta = await drive.get(PATHS.SOURCE_META)
  const { format, video, tracks } = JSON.parse(sourceMeta.toString())

  if (!tracks.length) {
    debug('no non-video tracks — demuxing unnecessary')
    return false
  }

  const durationEstimate = parseInt(format.duration * 1000, 10)
  debug('duration estimate: %dms', durationEstimate)

  const ext = path.extname(mp4File).split('.')[1]
  const folder = fs.mkdtempSync(`${temp || os.tmpdir()}${path.sep}tracks-`)
  debug('ffmpeg output dir: %s', folder)

  // FFmpeg logs go to local FS
  const logPath = path.join(temp || os.tmpdir(), 'ffmpeg_demux.log')
  const logStream = fs.createWriteStream(logPath, { flags: 'a' })

  return new Promise((resolve, reject) => {
    const outDefaults = [
      '-f', ext,
      '-movflags', '+faststart',
      '-write_tmcd', '0'
    ]

    const cmd = ffmpeg(mp4File).inputFPS(video[0].r_frame_rate)
    let audio = 0
    let sub = 0
    let vid = 1

    tracks.forEach((t) => {
      cmd.output(path.normalize(`${folder}/track_${t.index}_${t.codec_type}.${ext}`))
      if (t.codec_type === 'audio') {
        cmd.outputOptions(['-map', `0:a:${audio}`, `-c:a:${audio}`, 'copy', ...outDefaults])
        audio += 1
      } else if (t.codec_type === 'subtitle') {
        cmd.outputOptions(['-map', `0:s:${sub}`, `-c:s:${sub}`, 'copy', ...outDefaults])
        sub += 1
      } else if (t.codec_type === 'video') {
        cmd.outputOptions(['-map', `0:v:${vid}`, `-c:v:${vid}`, 'copy', '-f', ext])
        vid += 1
      }
    })

    cmd
      .on('start', c => debug(c))
      .on('progress', ffmpegOnProgress(logProgress, durationEstimate))
      .on('error', err => reject(err))
      .on('stderr', (line) => {
        debug(line)
        logStream.write(line + '\n')
      })
      .on('end', async () => {
        logStream.end()
        try {
          const writeOp = await write(folder, drive, 'tracks/inputs')
          resolve(writeOp)
        } catch (e) {
          reject(e)
        }
      })

    cmd.run()
  })
}

/**
 * Find the most recent concat file in the drive.
 */
async function getNewestConcat(drive) {
  const concats = []
  for await (const name of drive.readdir(PATHS.OUTPUTS_CONCATS)) {
    concats.push(name)
  }
  if (concats.length === 1) return concats[0]

  const sorted = concats
    .map(s => ({
      name: s,
      epoch: parseInt(path.basename(s, '.264').split('concat_')[1], 10)
    }))
    .sort((a, b) => b.epoch - a.epoch)

  return sorted[0].name
}

/**
 * Mux a concatenated video with its original audio/subtitle tracks.
 *
 * @param {Hyperdrive} drive
 * @param {string|null} concat — drive path to concat file (auto-detects newest if null)
 * @param {string|null} temp — temp directory
 * @returns {Promise<{ output: string, metadata: Map }>}
 */
async function mux(drive, concat, temp) {
  const sourceMeta = await drive.get(PATHS.SOURCE_META)
  const { video, format } = JSON.parse(sourceMeta.toString())
  const durationEstimate = parseInt(format.duration * 1000, 10)
  const ext = (path.extname(format.filename) === '.mov' ? 'mov' : 'mp4')

  const muxSource = concat || `${PATHS.OUTPUTS_CONCATS}/${await getNewestConcat(drive)}`
  const muxOut = path.normalize(`${temp || os.tmpdir()}/${path.basename(muxSource)}.${ext}`)

  // Pull concat video from drive to local temp for FFmpeg
  const concatLocal = path.join(temp || os.tmpdir(), `concat_src.264`)
  const concatBuf = await drive.get(muxSource)
  await fs.promises.writeFile(concatLocal, concatBuf)

  // FFmpeg logs to local FS
  const logPath = path.join(temp || os.tmpdir(), 'ffmpeg_mux.log')
  const logStream = fs.createWriteStream(logPath, { flags: 'a' })

  const otherTracks = await util.getTracks(drive)
  const [stems, tempDir] = await pullStems(drive, otherTracks, temp)

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(concatLocal).inputFPS(video[0].r_frame_rate)
    stems.forEach(s => cmd.input(`${tempDir}/${s.base}`))

    cmd.outputOptions([
      '-map', '0:0',
      ...stems.map(m => `-map ${m.id}:0`),
      '-c', 'copy',
      '-f', ext,
      '-movflags', '+faststart'
    ]).output(muxOut)
      .on('start', c => debug(c))
      .on('progress', ffmpegOnProgress(logProgress, durationEstimate))
      .on('error', err => reject(err))
      .on('stderr', (line) => {
        logStream.write(line + '\n')
      })
      .on('end', async () => {
        logStream.end()
        try {
          const muxMetaPath = `${PATHS.METADATA}/${path.basename(muxOut)}.json`
          const [muxMd, writeOp] = await Promise.all([
            metadata(muxOut, drive, muxMetaPath),
            write(muxOut, drive, 'outputs/muxes')
          ])
          resolve({ output: writeOp, metadata: muxMd })
        } catch (e) {
          reject(e)
        }
      })
      .run()
  })
}

module.exports = { demux, mux }
