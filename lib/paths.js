/**
 * Supernovao drive path layout.
 *
 * Hyperdrive has no "home" directory concept — all paths are
 * absolute from the drive root. These constants replace the
 * old cfs.HOME prefix pattern.
 */

const PATHS = {
  CONFIG: '/config',
  METADATA: '/metadata',
  PARTICIPANTS: '/participants',
  SOURCES: '/sources',

  SEGMENTS_IN: '/segments/inputs',
  SEGMENTS_OUT: '/segments/outputs',

  TRACKS_IN: '/tracks/inputs',
  TRACKS_OUT: '/tracks/outputs',

  OUTPUTS_CONCATS: '/outputs/concats',
  OUTPUTS_MUXES: '/outputs/muxes',

  PROFILE: '/supernovao-profile',
  SOURCE_META: '/metadata/source.json'
}

module.exports = PATHS
