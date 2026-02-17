const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('vmaf', () => {
  it('exports checkForVmaf and runVmaf', () => {
    const vmaf = require('../lib/vmaf')
    assert.strictEqual(typeof vmaf.checkForVmaf, 'function')
    assert.strictEqual(typeof vmaf.runVmaf, 'function')
  })
})
