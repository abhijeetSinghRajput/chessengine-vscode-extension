  /**
   * UCIEngine.js
   * ────────────────────────────────────────────────────────────────────────
   * Minimal, dependency-free wrapper around a local UCI engine binary
   * (e.g. chess.exe). Spawns the process once and keeps it alive for the
   * lifetime of the extension (or pool slot), talking to it over stdin/stdout.
   *
   * NOTE: This is a clean-room UCI client written for the Chanakya extension.
   * If you already have your own UCIEngine.js (e.g. from the backend/src/
   * folder of your original project), you can drop it in here instead —
   * EnginePool.js only requires the public methods listed below:
   *
   *   new UCIEngine(enginePath, args?)
   *   .init()                         → Promise<void>   (spawns + UCI handshake)
   *   .newGame()                      → Promise<void>
   *   .getBestMove({ fen, moves, movetime, depth, wtime, btime, winc, binc })
   *                                    → Promise<{ bestMove, depth, time, nodes }>
   *   .stop()                         → void   (send "stop" to abort a search)
   *   .quit()                         → void   (terminate the process)
   *   .on(event, cb)                  → subscribe to "error" | "exit"
   */

  const { spawn } = require("child_process");
  const { EventEmitter } = require("events");
  const path = require("path");
  const { EngineLogger } = require("./EngineLogger");

  class UCIEngine extends EventEmitter {
    /**
     * @param {string}   enginePath  - absolute path to the engine executable
     * @param {string[]} [args]      - optional CLI args for the engine
     */
    constructor(enginePath, args = []) {
      super();
      this.enginePath = enginePath;
      this.args = args;
      this.proc = null;
      this.buffer = "";
      this.ready = false;
      this._busy = false;
      this._pendingResolvers = [];
      this.logger = new EngineLogger(path.join(__dirname, "logs", "engine.log"));
    }

    /** Spawn the process and perform the uci/isready handshake. */
    init() {
      if (this.proc) return Promise.resolve();

      return new Promise((resolve, reject) => {
        try {
          this.proc = spawn(this.enginePath, this.args, {
            cwd: require("path").dirname(this.enginePath),
          });
          this.logger.event(`Spawned ${this.enginePath}`);
        } catch (err) {
          return reject(
            new Error(
              `Failed to spawn engine at "${this.enginePath}": ${err.message}`,
            ),
          );
        }

        this.proc.on("error", (err) => {
          this.emit("error", err);
          this.logger.error(err.stack);
          reject(err);
        });

        this.proc.on("exit", (code, signal) => {
          this.logger.event(`Engine exited code=${code} signal=${signal}`);

          this.ready = false;
          this.emit("exit", { code, signal });
        });

        this.proc.stdout.setEncoding("utf8");
        this.proc.stdout.on("data", (chunk) => this._onData(chunk));

        this.proc.stderr.setEncoding("utf8");

        this.proc.stderr.on("data", (chunk) => {
          this.logger.error(chunk.toString().trim());
        });

        this._send("uci");

        const onceReady = (line) => {
          if (line.trim() === "uciok") {
            this._send("isready");
          }
          if (line.trim() === "readyok") {
            this.ready = true;
            this.off("_line", onceReady);
            resolve();
          }
        };
        this.on("_line", onceReady);
      });
    }

    /** Reset engine internal state for a fresh game. */
    async newGame() {
      await this._ensureReady();
      this._send("ucinewgame");
      await this._isready();
    }

    /**
     * Ask the engine for the best move in the given position.
     * @param {object} req
     * @param {string}   req.fen        - starting FEN, or "startpos"
     * @param {string[]} [req.moves]    - UCI move list played from that FEN
     * @param {number}   [req.movetime] - ms to think
     * @param {number}   [req.depth]    - fixed search depth (overrides movetime if > 0)
     * @param {number}   [req.wtime]
     * @param {number}   [req.btime]
     * @param {number}   [req.winc]
     * @param {number}   [req.binc]
     * @returns {Promise<{bestMove:string, depth:number, time:number, nodes:number}>}
     */
    async getBestMove(req) {
      await this._ensureReady();
      if (this._busy) {
        throw new Error(
          "Engine is already searching — call stop() first or use a pooled instance.",
        );
      }
      this._busy = true;

      const { fen, moves = [], movetime, depth, wtime, btime, winc, binc } = req;

      const posCmd =
        fen && fen !== "startpos"
          ? `position fen ${fen}${moves.length ? " moves " + moves.join(" ") : ""}`
          : `position startpos${moves.length ? " moves " + moves.join(" ") : ""}`;

      this._send(posCmd);

      const goParts = ["go"];
      if (depth && depth > 0) {
        goParts.push("depth", depth);
      } else if (movetime && movetime > 0) {
        goParts.push("movetime", movetime);
      } else {
        goParts.push("movetime", 1000);
      }
      if (wtime != null) goParts.push("wtime", wtime);
      if (btime != null) goParts.push("btime", btime);
      if (winc != null) goParts.push("winc", winc);
      if (binc != null) goParts.push("binc", binc);

      const startedAt = Date.now();
      let lastDepth = depth || 0;
      let lastNodes = 0;
      let lastScore = null;
      let lastMate = null;
      let lastPV = [];

      // Listen for info updates
      const onInfo = (info) => {
        if (info.depth) lastDepth = info.depth;
        if (info.nodes) lastNodes = info.nodes;
        if (info.score !== null) lastScore = info.score;
        if (info.mate !== null) lastMate = info.mate;
        if (info.pv && info.pv.length) lastPV = info.pv;

        // Emit the latest info for UI updates
        this.emit("searchInfo", {
          depth: lastDepth,
          score: lastScore,
          mate: lastMate,
          nodes: lastNodes,
          time: Date.now() - startedAt,
          pv: lastPV,
        });
      };
      this.on("info", onInfo);

      return new Promise((resolve, reject) => {
        const onLine = (line) => {
          const trimmed = line.trim();

          if (trimmed.startsWith("bestmove")) {
            this.off("_line", onLine);
            this.off("info", onInfo);
            this._busy = false;

            const parts = trimmed.split(/\s+/);
            const bestMove = parts[1];
            if (!bestMove || bestMove === "(none)") {
              reject(
                new Error(
                  "Engine returned no legal move (checkmate/stalemate?).",
                ),
              );
              return;
            }

            resolve({
              bestMove,
              depth: lastDepth,
              time: Date.now() - startedAt,
              nodes: lastNodes,
              score: lastScore,
              mate: lastMate,
              pv: lastPV,
            });
          }
        };

        this.on("_line", onLine);
        this._send(goParts.join(" "));
      });
    }

    /** Ask the engine to abort the current search early. */
    stop() {
      if (this.proc) this._send("stop");
    }

    /** Kill the engine process. */
    quit() {
      if (!this.proc) return;
      try {
        this._send("quit");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        if (this.proc && !this.proc.killed) this.proc.kill();
      }, 200);
      this.proc = null;
      this.ready = false;
    }

    parseInfoLine(trimmed) {
      const info = {
        depth: null,
        score: null,
        mate: null,
        nodes: null,
        time: null,
        pv: [],
      };

      // Parse depth
      const dMatch = trimmed.match(/\bdepth (\d+)/);
      if (dMatch) info.depth = Number(dMatch[1]);

      // Parse score (cp or mate)
      const scoreMatch = trimmed.match(/\bscore (cp|mate) ([-\d]+)/);
      if (scoreMatch) {
        if (scoreMatch[1] === "cp") {
          info.score = Number(scoreMatch[2]);
        } else if (scoreMatch[1] === "mate") {
          info.mate = Number(scoreMatch[2]);
        }
      }

      // Parse nodes
      const nMatch = trimmed.match(/\bnodes (\d+)/);
      if (nMatch) info.nodes = Number(nMatch[1]);

      // Parse time
      const tMatch = trimmed.match(/\btime (\d+)/);
      if (tMatch) info.time = Number(tMatch[1]);

      // Parse PV
      const pvMatch = trimmed.match(/\bpv (.+)/);
      if (pvMatch) {
        info.pv = pvMatch[1].trim().split(/\s+/);
      }

      return info;
    }

    // ── internals ─────────────────────────────────────────────────────────

    async _ensureReady() {
      if (!this.proc) await this.init();
      if (!this.ready) await this._isready();
    }

    _isready() {
      return new Promise((resolve) => {
        const onLine = (line) => {
          if (line.trim() === "readyok") {
            this.ready = true;
            this.off("_line", onLine);
            resolve();
          }
        };
        this.on("_line", onLine);
        this._send("isready");
      });
    }

    _send(cmd) {
      if (!this.proc || !this.proc.stdin.writable) return;

      this.logger.send(cmd);

      this.proc.stdin.write(cmd + "\n");
    }

    _onData(chunk) {
      this.buffer += chunk;
      const lines = this.buffer.split(/\r?\n/);
      this.buffer = lines.pop();

      for (const line of lines) {
        if (!line.length) continue;

        const trimmed = line.trim();
        this.logger.recv(trimmed);
        if (trimmed.startsWith("info")) {
          const info = this.parseInfoLine(trimmed);
          this.emit("info", info);
        }

        this.emit("_line", line);
      }
    }
  }

  module.exports = { UCIEngine };

  