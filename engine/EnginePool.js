/**
 * EnginePool.js
 * ────────────────────────────────────────────────────────────────────────
 * Owns one UCIEngine instance per "slot" (by default one per color, "w"/"b")
 * so that when both bots are toggled on they don't block each other on a
 * single engine process. Also exposes a default/shared slot for one-off
 * "analyze this position" style requests from the webview.
 *
 * NOTE: `enginePath` is not a fixed string — it's a resolver function
 * `(slotKey) => absolutePath`, called every time a slot is (re)spawned.
 * This lets White and Black run different engine executables, and lets a
 * slot be re-pointed at a new engine at runtime (getEngine detects the
 * path changed and respawns).
 */

const { UCIEngine } = require("./UCIEngine");

class EnginePool {
  /**
   * @param {(slotKey: string) => string} resolveEnginePath
   * @param {number} maxInstances - how many engine processes to allow (default 2)
   */
  constructor(resolveEnginePath, maxInstances = 2) {
    this.resolveEnginePath = resolveEnginePath;
    this.maxInstances = Math.max(1, maxInstances);
    this.slots = new Map(); // key -> { engine, enginePath }
  }

  /**
   * Get (or lazily spawn/respawn) the engine assigned to a given slot key
   * ("w", "b", "default", ...). If the resolved path for this slot has
   * changed since it was last spawned (user picked a different engine),
   * the old process is quit and a fresh one is spawned in its place.
   */
  async getEngine(key = "default") {
    const desiredPath = this.resolveEnginePath(key);

    const existing = this.slots.get(key);
    if (existing && existing.enginePath === desiredPath) {
      return existing.engine;
    }

    if (existing) {
      // Same slot, different engine selected — retire the old process.
      existing.engine.quit();
      this.slots.delete(key);
    }

    if (this.slots.size >= this.maxInstances) {
      // At capacity — evict the oldest slot to make room.
      const [evictKey] = this.slots.keys();
      const evicted = this.slots.get(evictKey);
      evicted.engine.quit();
      this.slots.delete(evictKey);
    }

    const engine = new UCIEngine(desiredPath);
    await engine.init();
    await engine.newGame();
    this.slots.set(key, { engine, enginePath: desiredPath });
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
    await Promise.all(
      [...this.slots.values()].map(({ engine }) =>
        engine.newGame().catch(() => {}),
      ),
    );
  }

  /** Stop every in-flight search (e.g. user loaded a new position mid-think). */
  stopAll() {
    for (const { engine } of this.slots.values()) engine.stop();
  }

  /** Terminate every engine process. Call from the extension's deactivate(). */
  disposeAll() {
    for (const { engine } of this.slots.values()) engine.quit();
    this.slots.clear();
  }
}

module.exports = { EnginePool };