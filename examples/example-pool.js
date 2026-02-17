#!/usr/bin/env node
const fs = require('fs')
const Hyperswarm = require('hyperswarm')
const IdEnc = require('hypercore-id-encoding')
const { init, getStore, close } = require('../lib/store')
const Pool = require('../lib/pool')

const STORAGE = '.storage-pool-example'

async function main() {
  init(STORAGE)

  const pool = new Pool('demo/pool', null)
  await pool.createPoolDrive()

  // Seed config + segment data
  await pool.drive.put('/config/tracks.json', Buffer.from(JSON.stringify([{ codec: 'h264', type: 'video' }])))
  await pool.drive.put('/config/segments.json', Buffer.from(JSON.stringify([
    '/segments/inputs/seg001.ts',
    '/segments/inputs/seg002.ts',
    '/segments/inputs/seg003.ts'
  ])))
  await pool.loadConfig()
  console.log('Pool ready, segments:', pool.segmentsAvailable.length)

  const store = getStore()
  const kp = await store.createKeyPair('pool-swarm')
  const port = Number(process.env.DHT_PORT) || 30001
  const swarm = new Hyperswarm({ bootstrap: [{ host: '127.0.0.1', port }], keyPair: kp })

  await pool.launch(swarm)

  console.log('Pool listening on DHT port', port)
  console.log('Drive key:', IdEnc.normalize(pool.drive.key))
  console.log()
  console.log('Run the peer:')
  console.log('  node example-peer.js', IdEnc.normalize(pool.drive.key))

  process.on('SIGINT', async () => {
    console.log('\nShutting down...')
    await pool.destroy()
    await swarm.destroy()
    await close()
    fs.rmSync(STORAGE, { recursive: true, force: true })
    process.exit(0)
  })
}

main().catch(err => { console.error('FAILED:', err); process.exit(1) })
