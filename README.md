# supernovao

Distributed video encoding pools over the Hypercore protocol.

supernovao splits video files into segments, distributes them across a peer-to-peer pool for encoding, and reassembles the results. All data lives in Hyperdrives replicated over Hyperswarm.

## Requirements

- Node.js >= 18
- ffmpeg / ffprobe on PATH

## Install

```
npm install -g supernovao
```

## Usage

```
supernovao <command> [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `add <path>` | Add file or directory to drive |
| `cat <drive_path>` | Pipe a drive file to stdout |
| `concat [segments_dir]` | Concatenate segments (`-m` to also mux) |
| `create` | Create a new drive |
| `demux <source_file>` | Demux MP4 into tracks |
| `events` | Print the event log |
| `grab <pool_key>` | Grab a segment from a pool |
| `insert <path>` | Insert encoded segment into pool drive |
| `install <path>` | Install ffmpeg binaries |
| `join <pool_key>` | Join a pool and request work |
| `launch` | Launch a pool |
| `ls [path]` | List drive contents |
| `metadata <media_file>` | Write video metadata to drive |
| `mux [concat_file]` | Mux concatenated media to MP4 |
| `segment <media_file>` | Segment a file |
| `send <pool_key>` | Send results to a pool |

### Options

| Flag | Description |
|------|-------------|
| `-k, --key <key>` | Drive public key |
| `-i, --id <id>` | Drive identifier |
| `-t, --temp <path>` | Temp directory (default: `os.tmpdir()`) |
| `-y, --yes` | Skip sanity checks |
| `-v, --version` | Print version |
| `-h, --help` | Print help |
| `-p, --prefix <prefix>` | Drive path prefix for writes |
| `-m, --mux` | Mux after concat |
| `-P, --public` | Public pool |
| `-B, --bitrate <bitrate>` | Encode bitrate (default: 200000) |
| `-L, --level <level>` | H.264 level (default: 5.1) |
| `-r, --recursive` | Recursive operation |

## Workflow

### Pool operator (has the source video)

```bash
supernovao create
supernovao metadata -i my/project source.mp4
supernovao segment -i my/project source.mp4
supernovao demux -i my/project source.mp4
supernovao launch -i my/project
```

Pool prints its drive key. Share it with workers.

### Worker (encodes segments)

```bash
supernovao join <pool_key>
# encode the segment with your own tools
supernovao send <pool_key>
```

### Finalize (pool operator)

```bash
supernovao concat -i my/project -m
```

## Architecture

- **Corestore** — Singleton key-value store backing all Hyperdrives
- **Hyperdrive** — POSIX-like filesystem for video data and metadata
- **Hyperswarm** — DHT-based peer discovery and connection
- **ProtomuxRPC** — RPC layer for work assignment and result delivery

Pool and peer communicate over the same Hyperswarm connection: ProtomuxRPC handles work assignment while Corestore replication transfers segment data.

### Drive layout

```
/config             Pool configuration (tracks.json, segments.json)
/metadata           Video metadata (source.json)
/participants       Pool participant records
/sources            Source video files
/segments/inputs    Source segments (pre-encode)
/segments/outputs   Encoded segments (post-encode)
/tracks/inputs      Demuxed input tracks
/tracks/outputs     Processed output tracks
/outputs/concats    Concatenated segment files
/outputs/muxes      Final muxed output files
/supernovao-profile  Profile marker (pool or work)
```

## Testing

```
npm test
```

Uses `node:test` (Node.js built-in test runner). No external test dependencies.

## Environment

| Variable | Description |
|----------|-------------|
| `SUPERNOVAO_STORAGE` | Storage directory (default: `.supernovao`) |
| `DHT_PORT` | Hyperswarm DHT bootstrap port (default: 49737) |

## License

ISC
