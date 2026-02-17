const { EventEmitter } = require("events");
const debug = require("debug")("supernovao:peer");
const IdEnc = require("hypercore-id-encoding");
const ProtomuxRPC = require("protomux-rpc");
const crypto = require("hypercore-crypto");
const logger = require("pino")({ name: "peer" });
const PATHS = require("./paths");
const system = require("./system");

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

    swarm.on("connection", (conn, peerInfo) => {
      debug("connected to %s", IdEnc.normalize(peerInfo.publicKey));

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
    this.segments.claimed.push(segPath);
    this.logger.info({ claimedSegment: segPath });
    this.emit("segment-claimed", { segPath });

    return { segPath };
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
