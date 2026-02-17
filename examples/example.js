#!/usr/bin/env node
const path = require('path')
const fs = require('fs')
const Hyperswarm = require('hyperswarm')
const IdEnc = require('hypercore-id-encoding')
const { init, getStore, getDrive, close } = require('../lib/store')
const create = require('../lib/create')
const write = require('../lib/write')
const PATHS = require('../lib/paths')

async function main() {
  const storageDir = '.storage-example'

  try {
    // Phase 1: store + create
    console.log('--- Phase 1: store.js + create.js ---')
    init(storageDir)
    const drive = await create('example/demo', null, 'work')
    console.log('Drive key:', drive.key.toString('hex').slice(0, 16) + '...')
    console.log('Writable:', drive.writable)

    const profile = await drive.get(PATHS.PROFILE)
    console.log('Profile marker:', profile.toString())

    // Phase 2: write + read back
    console.log('\n--- Phase 2: write.js ---')
    const testFile = path.join(__dirname, '..', 'test', 'assets', 'testText')
    const drivePath = await write(testFile, drive, 'sources')
    console.log('Wrote to drive:', drivePath)

    const data = await drive.get(drivePath)
    console.log('Read back %d bytes: "%s"', data.length, data.toString().trim())

    // Write a directory
    const segDir = path.join(__dirname, '..', 'test', 'assets', 'seg')
    const written = await write(segDir, drive, 'segments/inputs')
    console.log('Wrote directory (%d files):', written.length)
    written.forEach(p => console.log('  ', p))

    // Readdir with async iterator
    console.log('\n--- Drive readdir (async iterator) ---')
    const entries = []
    for await (const name of drive.readdir(PATHS.SEGMENTS_IN)) {
      entries.push(name)
    }
    console.log('Segments in drive:', entries)

    // Phase 3: util.js pure functions
    console.log('\n--- Phase 3: util.js ---')
    const util = require('../lib/util')
    console.log('epoch():', util.epoch())
    console.log('getOs():', util.getOs())

    // Phase 4: pool.js + peer.js (no swarm, just class mechanics)
    console.log('\n--- Phase 4: pool.js ---')
    const Pool = require('../lib/pool')
    const pool = new Pool('example/pool', null)
    console.log('Pool created, id:', pool.id)
    console.log('Pool creationDate:', pool.creationDate)

    await pool.createPoolDrive()
    console.log('Pool drive key:', pool.drive.key.toString('hex').slice(0, 16) + '...')
    console.log('Pool drive writable:', pool.drive.writable)

    // Write fake config so loadConfig works
    const fakeTracks = [{ codec: 'h264', type: 'video' }]
    const fakeSegments = ['/segments/inputs/seg001.ts', '/segments/inputs/seg002.ts', '/segments/inputs/seg003.ts']
    await pool.drive.put('/config/tracks.json', Buffer.from(JSON.stringify(fakeTracks)))
    await pool.drive.put('/config/segments.json', Buffer.from(JSON.stringify(fakeSegments)))

    await pool.loadConfig()
    console.log('Pool ready:', pool.ready)
    console.log('Tracks loaded:', pool.tracks.length)
    console.log('Segments loaded:', pool.segments.length)
    console.log('Segments available:', pool.segmentsAvailable.length)

    // Test segment assignment
    const seg1 = pool.assignSegment()
    const seg2 = pool.assignSegment()
    console.log('Assigned:', seg1)
    console.log('Assigned:', seg2)
    console.log('Available after 2 assigns:', pool.segmentsAvailable.length)
    console.log('Claimed:', pool.segmentsClaimed.length)

    const seg3 = pool.assignSegment()
    const seg4 = pool.assignSegment()
    console.log('Assigned:', seg3)
    console.log('Assigned (should be null):', seg4)

    console.log('\n--- Phase 4: peer.js ---')
    const Peer = require('../lib/peer')

    // Create a worker drive
    const workerDrive = await getDrive('example/worker')
    console.log('Worker drive key:', IdEnc.normalize(workerDrive.key).slice(0, 16) + '...')

    // Create peer with pool's drive key
    const poolKeyHex = IdEnc.normalize(pool.drive.key)
    const peer = new Peer(poolKeyHex, workerDrive)
    console.log('Peer created for pool:', poolKeyHex.slice(0, 16) + '...')
    console.log('Peer segments state:', JSON.stringify(peer.segments))

    // Peer getSystemInfo
    const sysInfo = await peer.getSystemInfo()
    const parsed = JSON.parse(sysInfo)
    console.log('System info has peerInfo:', !!parsed.peerInfo)

    // Phase 4b: live Hyperswarm + ProtomuxRPC round-trip
    // Requires: npx hyperdht --bootstrap --host 127.0.0.1 --port 30001
    console.log('\n--- Phase 4b: Hyperswarm + RPC ---')

    const bootstrapPort = Number(process.env.DHT_PORT) || 30001
    const bootstrap = [{ host: '127.0.0.1', port: bootstrapPort }]
    console.log('Using DHT bootstrap:', bootstrap[0].host + ':' + bootstrap[0].port)

    const store = getStore()

    // Pool app — one swarm (like server.js in challenge)
    const poolKP = await store.createKeyPair('pool-swarm')
    const poolSwarm = new Hyperswarm({ bootstrap, keyPair: poolKP })

    // Peer app — one swarm (like client.js in challenge)
    const peerKP = await store.createKeyPair('peer-swarm')
    const peerSwarm = new Hyperswarm({ bootstrap, keyPair: peerKP })

    let pool2, peer2
    try {
      pool2 = new Pool('example/pool2', null)
      await pool2.createPoolDrive()

      // Seed pool drive with config + segment data
      await pool2.drive.put('/config/tracks.json', Buffer.from(JSON.stringify([{ codec: 'h264', type: 'video' }])))
      await pool2.drive.put('/config/segments.json', Buffer.from(JSON.stringify(['/segments/inputs/demo.ts'])))
      await pool2.drive.put('/segments/inputs/demo.ts', Buffer.from('fake-segment-data-1234'))
      await pool2.loadConfig()
      console.log('Pool ready, segments:', pool2.segmentsAvailable.length)

      // Pool launches on its app's swarm
      await pool2.launch(poolSwarm)
      console.log('Pool swarm listening, topic:', pool2.drive.discoveryKey.toString('hex').slice(0, 16))

      // Debug: log raw connections on both swarms
      poolSwarm.on('connection', (conn, info) => {
        console.log('  [poolSwarm] connection from', IdEnc.normalize(info.publicKey).slice(0, 8))
      })
      peerSwarm.on('connection', (conn, info) => {
        console.log('  [peerSwarm] connection from', IdEnc.normalize(info.publicKey).slice(0, 8))
      })

      // Peer joins pool on its app's swarm
      const workerDrive2 = await getDrive('example/worker2')
      peer2 = new Peer(IdEnc.normalize(pool2.drive.key), workerDrive2)
      console.log('Peer topic:', peer2.poolKey ? 'will resolve in joinPool' : 'n/a')

      // Wait for full round-trip: DHT discovery → connection → RPC → segment download
      const segResult = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('swarm timed out (30s)')), 30000)
        peer2.on('segment-received', (info) => { clearTimeout(timer); resolve(info) })
        peer2.on('no-work', () => { clearTimeout(timer); reject(new Error('pool had no work')) })
        peer2.joinPool(peerSwarm, 'work').catch(err => { clearTimeout(timer); reject(err) })
      })

      console.log('RPC round-trip complete!')
      console.log('  Segment assigned:', segResult.segPath)
      console.log('  Downloaded to:', segResult.localPath)

      const dlData = await fs.promises.readFile(segResult.localPath, 'utf8')
      console.log('  Data matches pool:', dlData === 'fake-segment-data-1234')

      await fs.promises.unlink(segResult.localPath).catch(() => {})
    } finally {
      if (peer2) await peer2.destroy()
      if (pool2) await pool2.destroy()
      await peerSwarm.destroy()
      await poolSwarm.destroy()
    }

    console.log('\nEverything works.')
  } finally {
    await close()
    fs.rmSync(storageDir, { recursive: true, force: true })
  }
}

main().catch(err => { console.error('FAILED:', err); process.exit(1) })
