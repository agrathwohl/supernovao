const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('join', () => {
  it('exports a function', () => {
    const join = require('../lib/join')
    assert.strictEqual(typeof join, 'function')
  })
})
