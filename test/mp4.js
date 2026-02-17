const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('mp4', () => {
  it('exports demux and mux', () => {
    const mp4 = require('../lib/mp4')
    assert.strictEqual(typeof mp4.demux, 'function')
    assert.strictEqual(typeof mp4.mux, 'function')
  })
})
