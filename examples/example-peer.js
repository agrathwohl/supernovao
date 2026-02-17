#!/usr/bin/env node
const Hyperswarm = require('hyperswarm')
const ProtomuxRPC = require('protomux-rpc')
const IdEnc = require('hypercore-id-encoding')
const crypto = require('hypercore-crypto')

async function main() {
  const poolKey = process.argv[2]
  if (!poolKey) {
    console.error('Usage: node example-peer.js <pool-drive-key>')
    process.exit(1)
  }

  const keyBuf = IdEnc.decode(poolKey)
  const topic = crypto.discoveryKey(keyBuf)

  const port = Number(process.env.DHT_PORT) || 30001
  const swarm = new Hyperswarm({ bootstrap: [{ host: '127.0.0.1', port }] })

  swarm.on('connection', async (conn, info) => {
    console.log('Connected to pool:', IdEnc.normalize(info.publicKey).slice(0, 8))

    const rpc = new ProtomuxRPC(conn)
    const resp = await rpc.request('request-work', Buffer.from(JSON.stringify({
      driveKey: 'test-peer'
    })))

    const result = JSON.parse(resp.toString())

    if (result.error) {
      console.log('Pool says:', result.error)
    } else {
      console.log('Segment assigned:', result.segment)
    }

    await swarm.destroy()
    process.exit(0)
  })

  swarm.join(topic)
  await swarm.flush()
  console.log('Looking for pool...')

  setTimeout(() => {
    console.log('TIMEOUT')
    process.exit(1)
  }, 15000)
}

main().catch(err => { console.error('FAILED:', err); process.exit(1) })
