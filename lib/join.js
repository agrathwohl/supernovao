const Peer = require('./peer')

async function join(poolKey, drive, swarm) {
  const peer = new Peer(poolKey, drive)
  await peer.joinPool(swarm, 'work')
  return peer
}

module.exports = join
