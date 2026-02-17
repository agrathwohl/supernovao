const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('send', () => {
  it('exports a function', () => {
    const send = require('../lib/send')
    assert.strictEqual(typeof send, 'function')
  })
})
