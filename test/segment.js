const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('segment', () => {
  it('exports a function', () => {
    const segment = require('../lib/segment')
    assert.strictEqual(typeof segment, 'function')
  })
})
