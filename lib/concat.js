const debug = require('debug')('supernovao:concat')
const path = require('path')

/**
 * Concatenate all .264 segment files from a drive directory
 * into a single output file within the drive.
 *
 * Reads segments sequentially and streams them into a single
 * write stream, producing a concatenated raw H.264 bitstream.
 *
 * @param {Hyperdrive} drive
 * @param {string} dir — drive directory containing .264 segments
 * @returns {Promise<string>} drive path of the concatenated output
 */
async function main(drive, dir) {
  // Collect segment filenames from the async iterator
  const segments = []
  for await (const name of drive.readdir(dir)) {
    if (path.extname(name) === '.264') {
      segments.push(`${dir}/${name}`)
    }
  }
  segments.sort()

  debug('segments to concat: %d', segments.length)
  if (!segments.length) {
    throw new Error('No .264 files found in ' + dir)
  }

  const outFile = `/outputs/concats/concat_${Date.now()}.264`
  debug('concat outfile: %s', outFile)

  const writer = drive.createWriteStream(outFile)

  // Stream each segment into the writer sequentially.
  // Manual read/write instead of pipe — streamx pipe propagates
  // destroy from reader to writer, which kills the writer early.
  for (const seg of segments) {
    await new Promise((resolve, reject) => {
      const reader = drive.createReadStream(seg)
      reader.on('error', reject)
      reader.on('end', resolve)
      reader.on('data', (chunk) => {
        if (!writer.write(chunk)) {
          reader.pause()
          writer.once('drain', () => reader.resume())
        }
      })
    })
    debug('appended %s', seg)
  }

  // Close the write stream
  await new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
    writer.end()
  })

  return outFile
}

module.exports = main
