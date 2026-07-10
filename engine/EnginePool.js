/**
 * EnginePool.js
 * ────────────────────────────────────────────────────────────────────────
 * Owns one UCIEngine instance per "slot" (by default one per color, "w"/"b")
 * so that when both bots are toggled on they don't block each other on a
 * single engine process. Also exposes a default/shared slot for one-off
 * "analyze this position" style requests from the webview.
 */

const { UCIEngine } = require("./UCIEngine");

class EnginePool {
  /**
   * @param {string} enginePath
   * @param {number} maxInstances - how many engine processes to allow (default 2)
   */
  constructor(enginePath, maxInstances = 2) {
    this.enginePath = enginePath;
    this.maxInstances = Math.max(1, maxInstances);
    this.slots = new Map(); // key -> UCIEngine
  }

  /** Get (or lazily spawn) the engine assigned to a given slot key ("w", "b", "default", ...). */
  async getEngine(key = "default") {
    if (this.slots.has(key)) return this.slots.get(key);

    // If we've hit the cap, fall back to round-robin reuse of an existing engine.
    if (this.slots.size >= this.maxInstances) {
      const [reuseKey] = this.slots.keys();
      return this.slots.get(reuseKey);
    }

    const engine = new UCIEngine(this.enginePath);
    await engine.init();
    await engine.newGame();
    this.slots.set(key, engine);
    return engine;
  }

  /**
   * Request a move from the engine assigned to `key`.
   * @param {string} key  - "w" | "b" | "default"
   * @param {object} payload - see UCIEngine.getBestMove
   */
  async requestMove(key, payload) {
    const engine = await this.getEngine(key);
    return engine.getBestMove(payload);
  }

  /** Reset all live engines for a brand-new game. */
  async newGame() {
    await Promise.all([...this.slots.values()].map((e) => e.newGame().catch(() => {})));
  }

  /** Stop every in-flight search (e.g. user loaded a new position mid-think). */
  stopAll() {
    for (const engine of this.slots.values()) engine.stop();
  }

  /** Terminate every engine process. Call from the extension's deactivate(). */
  disposeAll() {
    for (const engine of this.slots.values()) engine.quit();
    this.slots.clear();
  }
}

module.exports = { EnginePool };
