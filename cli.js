#!/usr/bin/env node

const { parseArgs } = require('node:util')
const debug = require('debug')('supernovao')
const fs = require('fs')
const logger = require('pino')()
const os = require('os')
const path = require('path')
const Hyperswarm = require('hyperswarm')
const IdEnc = require('hypercore-id-encoding')

const { init, close } = require('./lib/store')
const cat = require('./lib/cat')
const concat = require('./lib/concat')
const create = require('./lib/create')
const join = require('./lib/join')
const metadata = require('./lib/metadata')
const mp4 = require('./lib/mp4')
const Pool = require('./lib/pool')
const segment = require('./lib/segment')
const send = require('./lib/send')
const util = require('./lib/util')
const write = require('./lib/write')
const PATHS = require('./lib/paths')

const STORAGE = process.env.SUPERNOVAO_STORAGE || '.supernovao'

const { values: opts, positionals } = parseArgs({
  options: {
    key: { type: 'string', short: 'k' },
    id: { type: 'string', short: 'i' },
    temp: { type: 'string', short: 't' },
    yes: { type: 'boolean', short: 'y', default: false },
    version: { type: 'boolean', short: 'v', default: false },
    help: { type: 'boolean', short: 'h', default: false },
    prefix: { type: 'string', short: 'p' },
    mux: { type: 'boolean', short: 'm', default: false },
    public: { type: 'boolean', short: 'P', default: false },
    bitrate: { type: 'string', short: 'B' },
    level: { type: 'string', short: 'L' },
    recursive: { type: 'boolean', short: 'r', default: false }
  },
  allowPositionals: true,
  strict: false
})

if (!opts.id) opts.id = `supernovao/${Math.floor(Date.now() / 1000)}`
if (!opts.temp) opts.temp = os.tmpdir()
if (!opts.bitrate) opts.bitrate = '200000'
if (!opts.level) opts.level = '5.1'

const cmd = positionals[0]
const arg = positionals[1]

const USAGE = `supernovao <command> [options]

Commands:
  add <path>            Add file or directory to drive
  cat <drive_path>      Pipe a drive file to stdout
  concat [segments_dir] Concatenate segments (-m to also mux)
  create                Create a new drive
  demux <source_file>   Demux MP4 into tracks
  events                Print the event log
  grab <pool_key>       Grab a segment from a pool
  insert <path>         Insert encoded segment into pool drive
  install <path>        Install ffmpeg binaries
  join <pool_key>       Join a pool and request work
  launch                Launch a pool
  ls [path]             List drive contents
  metadata <media_file> Write video metadata to drive
  mux [concat_file]     Mux concatenated media to MP4
  segment <media_file>  Segment a file
  send <pool_key>       Send results to a pool

Options:
  -k, --key <key>       Drive public key
  -i, --id <id>         Drive identifier
  -t, --temp <path>     Temp directory [default: os.tmpdir()]
  -y, --yes             Skip sanity checks
  -v, --version         Print version
  -h, --help            Print this help`

if (opts.version) {
  const pkg = require('./package.json')
  console.log(pkg.version)
  process.exit(0)
}

if (opts.help || !cmd) {
  console.log(USAGE)
  process.exit(0)
}

async function prepareOpts(drive, bitrate, level) {
  const data = await drive.get(PATHS.SOURCE_META)
  const video = JSON.parse(data.toString()).video[0]
  return {
    bitrate: Number(bitrate),
    level: Number(level),
    width: video.width,
    height: video.height,
    fps: video.r_frame_rate,
    profile: video.profile
  }
}

async function checkConfig(drive) {
  const configs = []
  for await (const name of drive.readdir(PATHS.CONFIG)) {
    configs.push(name)
  }
  debug('configs:', configs)
  return configs
}

async function updateConfig(drive, cfg, val) {
  await drive.put(`${PATHS.CONFIG}/${cfg}.json`, Buffer.from(JSON.stringify(val)))
}

function makeSwarm(bootstrap) {
  const port = Number(process.env.DHT_PORT) || 49737
  const bp = bootstrap || [{ host: '127.0.0.1', port }]
  return new Hyperswarm({ bootstrap: bp })
}

function untilSigint() {
  return new Promise((resolve) => {
    process.on('SIGINT', resolve)
  })
}

const commands = {
  async add() {
    if (!arg) throw new Error('Usage: supernovao add <path>')
    const drive = await create(opts.id, opts.key, 'work')
    const result = await write(arg, drive, opts.prefix || '')
    logger.info(result)
  },

  async cat() {
    if (!arg) throw new Error('Usage: supernovao cat <drive_path>')
    const drive = await create(opts.id, opts.key)
    await cat(arg, drive)
  },

  async concat() {
    const drive = await create(opts.id, opts.key)
    const dir = arg || PATHS.SEGMENTS_OUT
    const concatFile = await concat(drive, dir)
    if (!opts.mux) {
      logger.info(concatFile)
      await updateConfig(drive, 'concat', concatFile)
      return
    }
    const muxFile = await mp4.mux(drive, concatFile)
    logger.info(muxFile)
    await updateConfig(drive, 'mux', muxFile)
  },

  async create() {
    const drive = await create(opts.id, null, arg || 'pool')
    logger.info({
      id: opts.id,
      key: IdEnc.normalize(drive.key)
    })
  },

  async demux() {
    if (!arg) throw new Error('Usage: supernovao demux <source_file>')
    const drive = await create(opts.id, opts.key)
    const configs = await checkConfig(drive)
    if (configs.includes('tracks.json') && !opts.yes) {
      throw new Error('Tracks config exists. Use -y to overwrite.')
    }
    const tracks = await mp4.demux(drive, arg, opts.temp)
    logger.info({ tracks })
    await updateConfig(drive, 'tracks', tracks)
  },

  async events() {
    if (!opts.id) throw new Error('An ID must be specified.')
    const drive = await create(opts.id, opts.key)
    await cat('/var/log/events', drive)
  },

  async grab() {
    if (!arg) throw new Error('Usage: supernovao grab <pool_key>')
    const drive = await create(opts.id, null, 'work')
    const swarm = makeSwarm()
    const peer = await join(arg, drive, swarm)
    peer.on('segment-claimed', (info) => logger.info(info))
    peer.on('segment-encoded', (info) => logger.info(info))
    peer.on('encode-error', (info) => logger.error(info))
    peer.on('no-work', () => logger.info('No work available'))
    await untilSigint()
    await peer.destroy()
    await swarm.destroy()
  },

  async insert() {
    if (!arg) throw new Error('Usage: supernovao insert <path>')
    const drive = await create(opts.id, opts.key)
    await write(arg, drive, 'segments/outputs')
    const pool = new Pool(opts.id, opts.key)
    await pool.createPoolDrive()
    await pool.loadConfig()
    await pool.checkCompletion()
  },

  async install() {
    if (!arg) throw new Error('Usage: supernovao install <path>')
    try {
      await fs.promises.access(`${arg}/ffmpeg`, fs.constants.F_OK)
      logger.info('Already installed')
    } catch {
      await util.getFfmpeg(arg)
      logger.info({ success: true })
    }
  },

  async join() {
    if (!arg) throw new Error('Usage: supernovao join <pool_key>')
    const drive = await create(opts.id, null, 'work')
    const swarm = makeSwarm()
    const peer = await join(arg, drive, swarm)
    peer.on('segment-claimed', (info) => logger.info(info))
    peer.on('segment-encoded', (info) => logger.info(info))
    peer.on('encode-error', (info) => logger.error(info))
    peer.on('no-work', () => logger.info('No work available'))
    await untilSigint()
    await peer.destroy()
    await swarm.destroy()
  },

  async launch() {
    if (opts.key) throw new Error('Do not specify a key to launch.')
    const pool = new Pool(opts.id, null, { public: opts.public })
    await pool.createPoolDrive()
    await pool.loadConfig()
    const encOpts = await prepareOpts(pool.drive, opts.bitrate, opts.level)
    pool.encodeOpts = encOpts
    logger.info({
      key: IdEnc.normalize(pool.drive.key),
      encodeOptions: encOpts
    })
    const swarm = makeSwarm()
    await pool.launch(swarm)
    logger.info('Pool launched')
    await untilSigint()
    await pool.destroy()
    await swarm.destroy()
  },

  async ls() {
    const drive = await create(opts.id, opts.key)
    const listPath = arg || '/'
    const files = []
    for await (const name of drive.readdir(listPath)) {
      files.push(path.posix.join(listPath, name))
    }
    logger.info({ files })
  },

  async metadata() {
    if (!arg) throw new Error('Usage: supernovao metadata <media_file>')
    const drive = await create(opts.id, opts.key)
    const md = await metadata(arg, drive)
    logger.info(md)
  },

  async mux() {
    const drive = await create(opts.id, opts.key)
    const result = await mp4.mux(drive, arg)
    const muxOut = `${PATHS.OUTPUTS_MUXES}/${path.basename(arg)}.mp4`
    logger.info(muxOut)
    await updateConfig(drive, 'mux', muxOut)
  },

  async segment() {
    if (!arg) throw new Error('Usage: supernovao segment <media_file>')
    const drive = await create(opts.id, opts.key)
    const configs = await checkConfig(drive)
    if (configs.includes('segments.json') && !opts.yes) {
      throw new Error('Segments config exists. Use -y to overwrite.')
    }
    await metadata(arg, drive)
    const [segments, tmpDir] = await segment(arg, drive, opts.temp)
    logger.info({ segments, tmpDir })
    await updateConfig(drive, 'segments', segments)
  },

  async send() {
    if (!arg) throw new Error('Usage: supernovao send <pool_key>')
    if (opts.key) throw new Error('Work drive must not specify a key.')
    const drive = await create(opts.id, null, 'work')
    const swarm = makeSwarm()
    const peer = await send(arg, drive, swarm)
    peer.on('results-delivered', (segs) => logger.info({ delivered: segs }))
    peer.on('no-results', () => logger.info('No results to send'))
    await untilSigint()
    await peer.destroy()
    await swarm.destroy()
  }
}

debug('cli args', { cmd, arg, id: opts.id, key: opts.key, temp: opts.temp, yes: opts.yes })

process.on('warning', e => debug(e.stack))

;(async function main() {
  const handler = commands[cmd]
  if (!handler) {
    console.error(`Unknown command: ${cmd}\n`)
    console.log(USAGE)
    process.exit(1)
  }

  try {
    init(STORAGE)
    await handler()
  } catch (err) {
    logger.error(err.message)
    process.exit(1)
  } finally {
    await close()
  }
}())
