const { EventEmitter } = require("events");
const debug = require("debug")("supernovao:peer");
const path = require("path");
const IdEnc = require("hypercore-id-encoding");
const ProtomuxRPC = require("protomux-rpc");
const crypto = require("hypercore-crypto");
const ffmpegCmd = require("fluent-ffmpeg");
const logger = require("pino")({ name: "peer" });
const PATHS = require("./paths");
const system = require("./system");
const { getStore, getDrive } = require("./store");
const { createFFmpegOpts } = require("./ffmpeg");

/*
 * Supernovao Peer (Worker)
 * ========================
 *
 * Peer joins the pool's topic (pool drive discoveryKey) as client.
 * On connection: store.replicate + ProtomuxRPC on same socket.
 *
 */

class Peer extends EventEmitter {
  constructor(poolKey, drive, opts = {}) {
    super();
    this.poolKey = poolKey;
    this.drive = drive;
    this.opts = opts;
    this.swarm = null;
    this.topic = null;
    this.poolDrive = null;
    this.segments = {
      claimed: [],
      processing: [],
      done: [],
      delivered: [],
    };
    this.logger = logger.child({
      key: IdEnc.normalize(this.drive.key),
      poolKey:
        typeof poolKey === "string"
          ? poolKey.slice(0, 8)
          : IdEnc.normalize(poolKey).slice(0, 8),
    });
    debug("peer created");
  }

  async getSystemInfo() {
    return JSON.stringify(await system());
  }

  async joinPool(swarm, task) {
    this.swarm = swarm;

    const poolKeyBuf = Buffer.isBuffer(this.poolKey)
      ? this.poolKey
      : IdEnc.decode(this.poolKey);
    this.topic = crypto.discoveryKey(poolKeyBuf);

    if (task === "work") {
      this.poolDrive = await getDrive("pool", poolKeyBuf);
    }

    swarm.on("connection", (conn, peerInfo) => {
      debug("connected to %s", IdEnc.normalize(peerInfo.publicKey));

      getStore().replicate(conn);
      const rpc = new ProtomuxRPC(conn);
      this._handleTask(rpc, task);
    });

    swarm.join(this.topic);
    await swarm.flush();

    this.logger.info({
      task,
      poolKey:
        typeof this.poolKey === "string"
          ? this.poolKey.slice(0, 8)
          : IdEnc.normalize(this.poolKey).slice(0, 8),
    });
  }

  async _handleTask(rpc, task) {
    switch (task) {
      case "work":
        await this._requestWork(rpc);
        break;
      case "send":
        await this._sendResults(rpc);
        break;
      default:
        this.logger.error({ task }, "unknown task");
    }
  }

  async _requestWork(rpc) {
    while (true) {
      const response = await rpc.request(
        "request-work",
        Buffer.from(
          JSON.stringify({
            driveKey: IdEnc.normalize(this.drive.key),
          }),
        ),
      );

      const result = JSON.parse(response.toString());

      if (result.error) {
        this.logger.info("No work available");
        this.emit("no-work");
        return null;
      }

      const segPath = result.segment;
      const encodeOpts = result.encodeOpts;
      this.segments.claimed.push(segPath);
      this.logger.info({ claimedSegment: segPath });
      this.emit("segment-claimed", { segPath });

      try {
        await this.poolDrive.update({ wait: true });
        this.segments.processing.push(segPath);
        this.logger.info({ segPath }, "encoding segment");

        // Resolve encode settings
        let fps = 30;
        let bitrate = 200000;
        if (encodeOpts) {
          fps = encodeOpts.fps || fps;
          bitrate = encodeOpts.bitrate || bitrate;
        } else {
          const metaBuf = await this.poolDrive.get(PATHS.SOURCE_META);
          if (metaBuf) {
            const meta = JSON.parse(metaBuf.toString());
            if (meta.video && meta.video[0]) {
              fps = meta.video[0].r_frame_rate || fps;
            }
          }
        }

        // Pool drive read stream → ffmpeg → work drive write stream
        const settings = createFFmpegOpts({ fps, bitrate });
        const outPath = PATHS.SEGMENTS_OUT + "/" + path.basename(segPath);
        await new Promise((resolve, reject) => {
          ffmpegCmd(this.poolDrive.createReadStream(segPath))
            .inputOptions(settings.opts.input)
            .outputOptions(settings.opts.output)
            .format("h264")
            .on("error", reject)
            .on("end", resolve)
            .pipe(this.drive.createWriteStream(outPath), { end: true });
        });

        this.segments.processing = this.segments.processing.filter(
          (s) => s !== segPath,
        );
        this.segments.done.push(outPath);
        this.logger.info({ segPath, outPath }, "segment encoded");
        this.emit("segment-encoded", { segPath, outPath });
      } catch (err) {
        this.logger.error({ segPath, err: err.message }, "encoding failed");
        this.emit("encode-error", { segPath, error: err.message });
      }
    }
  }

  async _sendResults(rpc) {
    const outputSegs = [];
    for await (const name of this.drive.readdir(PATHS.SEGMENTS_OUT)) {
      outputSegs.push(`${PATHS.SEGMENTS_OUT}/${name}`);
    }

    if (!outputSegs.length) {
      this.logger.info("No output segments to send");
      this.emit("no-results");
      return null;
    }

    this.logger.info({ sendingSegments: outputSegs });

    const response = await rpc.request(
      "send-results",
      Buffer.from(
        JSON.stringify({
          driveKey: IdEnc.normalize(this.drive.key),
          segments: outputSegs,
        }),
      ),
    );

    const result = JSON.parse(response.toString());

    if (result.success) {
      this.segments.delivered.push(...outputSegs);
      this.logger.info("Results delivered successfully");
      this.emit("results-delivered", outputSegs);
    } else {
      this.logger.error({ error: result.error }, "Failed to deliver results");
      this.emit("error", new Error(result.error));
    }

    return result;
  }

  async destroy() {
    if (this.swarm && this.topic) {
      this.swarm.leave(this.topic);
    }
    this.swarm = null;
  }
}

module.exports = Peer;
