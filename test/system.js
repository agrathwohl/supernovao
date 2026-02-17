const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('system', () => {
  it('returns object with peerInfo', async () => {
    const system = require('../lib/system')
    const info = await system()
    assert(info.peerInfo)
    assert(info.peerInfo.system)
    assert(info.peerInfo.network)
  })
})
