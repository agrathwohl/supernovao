const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const PATHS = require('../lib/paths')

describe('paths', () => {
  const required = [
    'CONFIG', 'METADATA', 'PARTICIPANTS', 'SOURCES',
    'SEGMENTS_IN', 'SEGMENTS_OUT', 'TRACKS_IN', 'TRACKS_OUT',
    'OUTPUTS_CONCATS', 'OUTPUTS_MUXES', 'PROFILE', 'SOURCE_META'
  ]

  it('exports all required constants', () => {
    for (const key of required) {
      assert(key in PATHS, `missing: ${key}`)
    }
  })

  it('all paths start with /', () => {
    for (const [key, val] of Object.entries(PATHS)) {
      assert(val.startsWith('/'), `${key} should start with /`)
    }
  })

  it('no legacy /home/ prefix', () => {
    for (const [key, val] of Object.entries(PATHS)) {
      assert(!val.includes('/home/'), `${key} has /home/ prefix`)
    }
  })

  it('SOURCE_META is under METADATA', () => {
    assert(PATHS.SOURCE_META.startsWith(PATHS.METADATA))
  })
})
