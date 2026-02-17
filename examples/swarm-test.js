#!/usr/bin/env node
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const Hyperdrive = require('hyperdrive')
const ProtomuxRPC = require('protomux-rpc')
const IdEnc = require('hypercore-id-encoding')
const fs = require('fs')

const bootstrap = [{ host: '127.0.0.1', port: 30001 }]

async function main() {
  // One store (like the singleton)
  const store = new Corestore('.storage-swarm-test')

  // Create a drive — its discoveryKey is the topic
  const ns = store.namespace('test-pool')
  const drive = new Hyperdrive(ns)
  await drive.ready()

  await drive.put('/test.txt', Buffer.from('hello from pool drive'))

  const topic = drive.discoveryKey
  console.log('drive key:', IdEnc.normalize(drive.key))
  console.log('topic (discoveryKey):', topic.toString('hex').slice(0, 16))

  // Server swarm (pool side)
  const serverKP = await store.createKeyPair('server')
  const server = new Hyperswarm({ bootstrap, keyPair: serverKP })

  // Client swarm (peer side)
  const clientKP = await store.createKeyPair('client')
  const client = new Hyperswarm({ bootstrap, keyPair: clientKP })

  server.on('connection', (conn, info) => {
    console.log('SERVER: connection from', IdEnc.normalize(info.publicKey).slice(0, 8))
    store.replicate(conn)
    const rpc = new ProtomuxRPC(conn)

    rpc.respond('ping', async (req) => {
      console.log('SERVER: got ping:', req.toString())
      return Buffer.from('pong')
    })
  })

  client.on('connection', async (conn, info) => {
    console.log('CLIENT: connection from', IdEnc.normalize(info.publicKey).slice(0, 8))
    store.replicate(conn)
    const rpc = new ProtomuxRPC(conn)

    const resp = await rpc.request('ping', Buffer.from('hello'))
    console.log('CLIENT: got response:', resp.toString())

    // Read from pool drive via shared store
    const data = await drive.get('/test.txt')
    console.log('CLIENT: drive data:', data.toString())

    console.log('\nSUCCESS')
    await client.destroy()
    await server.destroy()
    await store.close()
    fs.rmSync('.storage-swarm-test', { recursive: true, force: true })
    process.exit(0)
  })

  server.join(topic)
  await server.listen()
  console.log('server listening')

  client.join(topic)
  await client.flush()
  console.log('client flushed')

  setTimeout(async () => {
    console.log('TIMEOUT — no connection')
    await client.destroy()
    await server.destroy()
    await store.close()
    fs.rmSync('.storage-swarm-test', { recursive: true, force: true })
    process.exit(1)
  }, 15000)
}

main().catch(console.error)
