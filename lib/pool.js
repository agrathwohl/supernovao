const { EventEmitter } = require("events");
const debug = require("debug")("supernovao:pool");
const IdEnc = require("hypercore-id-encoding");
const ProtomuxRPC = require("protomux-rpc");
const path = require("path");
const logger = require("pino")({ name: "pool" });
const { getDrive, getStore } = require("./store");
const PATHS = require("./paths");
const concat = require("./concat");
const mp4 = require("./mp4");
const util = require("./util");

/*
 * Supernovao Pool
 * ===============
 *
 * A pool is a topic on the swarm. The app creates ONE Hyperswarm,
 * and Pool joins the drive's discoveryKey as server. Workers find
 * the pool by joining the same topic as client.
 *
 * On each connection the app-level swarm fires, Pool registers
 * ProtomuxRPC handlers for 'request-work' and 'send-results'.
 *
 * Pool does NOT own or create the swarm — the app does.
 */

class Pool extends EventEmitter {
  constructor(id, key, opts = {}) {
    super();
    this.id = id;
    this.key = key;
    this.opts = opts;
    this.creationDate = util.epoch();
    this.drive = null;
    this.swarm = null;
    this.tracks = [];
    this.segments = [];
    this.segmentsAvailable = [];
    this.segmentsClaimed = [];
    this.segmentsComplete = [];
    this.encodeOpts = opts.encodeOpts || null;
    this.workers = new Map();
    this.logger = logger.child({ creationDate: this.creationDate });
    debug("new pool");
  }

  async createPoolDrive() {
    this.drive = await getDrive(this.id, this.key);
    debug("pool drive key=%s", IdEnc.normalize(this.drive.key));
    return this.drive;
  }

  async loadConfig() {
    if (!this.drive) await this.createPoolDrive();

    const configEntries = [];
    for await (const name of this.drive.readdir(PATHS.CONFIG)) {
      configEntries.push(name);
    }

    if (configEntries.length >= 2) {
      const tracksFile = configEntries.find((n) => n.includes("track"));
      const segsFile = configEntries.find((n) => n.includes("segment"));
      if (tracksFile && segsFile) {
        const tracksData = await this.drive.get(
          `${PATHS.CONFIG}/${tracksFile}`,
        );
        const segsData = await this.drive.get(`${PATHS.CONFIG}/${segsFile}`);
        this.tracks = JSON.parse(tracksData.toString());
        this.segments = JSON.parse(segsData.toString());
        this.segmentsAvailable = [...this.segments];
      }
    }

    this.ready = this.segments.length > 0;
    this.logger.info({
      tracks: this.tracks.length,
      segments: this.segments.length,
      ready: this.ready,
    });
    return this;
  }

  assignSegment() {
    if (!this.segmentsAvailable.length) {
      debug("no segments available");
      return null;
    }
    const segment = this.segmentsAvailable.pop();
    this.segmentsClaimed.push(segment);
    this.logger.info({ assignedSegment: segment });
    return segment;
  }

  async launch(swarm) {
    if (!this.drive) await this.createPoolDrive();
    const store = getStore();
    this.swarm = swarm;

    swarm.on("connection", (conn, peerInfo) => {
      const peerId = IdEnc.normalize(peerInfo.publicKey);
      debug("connection from %s", peerId);

      store.replicate(conn);

      const rpc = new ProtomuxRPC(conn);

      rpc.respond("request-work", async (req) => {
        const { driveKey } = JSON.parse(req.toString());
        this.workers.set(peerId, { driveKey });

        const segment = this.assignSegment();
        if (!segment) {
          return Buffer.from(JSON.stringify({ error: "no-work" }));
        }
        return Buffer.from(JSON.stringify({ segment, encodeOpts: this.encodeOpts }));
      });

      rpc.respond("send-results", async (req) => {
        const { driveKey, segments } = JSON.parse(req.toString());
        this.workers.set(peerId, { driveKey });

        try {
          const workerDrive = await getDrive(
            `peer-${peerId.slice(0, 8)}`,
            driveKey,
          );

          for (const segPath of segments) {
            debug("downloading %s from worker %s", segPath, peerId.slice(0, 8));
            await workerDrive.update();
            const segData = await workerDrive.get(segPath);
            const outPath = `${PATHS.SEGMENTS_OUT}/${path.basename(segPath)}`;
            await this.drive.put(outPath, segData);
            this.segmentsComplete.push(outPath);
            this.logger.info({ downloadedResult: outPath });
          }

          await this.checkCompletion();
          return Buffer.from(JSON.stringify({ success: true }));
        } catch (err) {
          this.logger.error({ err: err.message });
          return Buffer.from(
            JSON.stringify({ success: false, error: err.message }),
          );
        }
      });
    });

    swarm.join(this.drive.discoveryKey);
    await swarm.listen();

    this.logger.info({
      driveKey: IdEnc.normalize(this.drive.key),
      swarmKey: IdEnc.normalize(swarm.keyPair.publicKey),
    });

    return this;
  }

  async checkCompletion() {
    const compBasenames = this.segmentsComplete
      .map((s) => path.basename(s))
      .sort();
    const segBasenames = this.segments.map((s) => path.basename(s)).sort();

    debug("complete: %d/%d", compBasenames.length, segBasenames.length);

    if (compBasenames.join("|") === segBasenames.join("|")) {
      this.logger.info("All segments complete. Finalizing encode.");
      this.emit("all-complete");
      const result = await this.finalizeEncode();
      this.emit("finalized", result);
      return result;
    }
    return null;
  }

  async finalizeEncode() {
    const concatFile = await concat(this.drive, PATHS.SEGMENTS_OUT);
    const muxFile = await mp4.mux(this.drive, concatFile);
    this.logger.info({ concatFile, muxFile: muxFile.output });
    return muxFile.output;
  }

  async destroy() {
    if (this.swarm && this.drive) {
      this.swarm.leave(this.drive.discoveryKey);
    }
    this.swarm = null;
  }
}

module.exports = Pool;
