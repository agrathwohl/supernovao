const Peer = require('./peer')

async function send(poolKey, drive, swarm) {
  const peer = new Peer(poolKey, drive)
  await peer.joinPool(swarm, 'send')
  return peer
}

module.exports = send
