// historyStore.js — persistence via context.globalState (VS Code Memento).
// Chosen over a JSON file / SQLite: already-persisted, sync reads, async
// writes, zero extra deps — right fit for a handful of small text blobs.

const CURRENT_KEY = "chanakya.currentGame";
const HISTORY_KEY = "chanakya.history";
const MAX_HISTORY = 50;

function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

class HistoryStore {
  constructor(globalState) {
    this._state = globalState;
    this._hashSet = new Set(this.getHistory().map((g) => g.hash));
  }

  // ── Current (in-progress) game — overwritten every move ──────────────
  setCurrentGame(pgn) {
    this._state.update(CURRENT_KEY, { pgn, updatedAt: Date.now() });
  }

  getCurrentGame() {
    return this._state.get(CURRENT_KEY) || null;
  }

  clearCurrentGame() {
    this._state.update(CURRENT_KEY, undefined);
  }

  // ── Finished/loaded games — append-only, deduped by content hash ─────
  /** Returns { added: boolean, id?: string } */
  commitToHistory(pgn) {
    const hash = fnv1a(pgn);

    this.clearCurrentGame(); // it's no longer "in progress"

    if (this._hashSet.has(hash)) {
      return { added: false, id: hash };
    }

    const entry = { id: hash, pgn, hash, savedAt: Date.now() };
    const history = [entry, ...this.getHistory()].slice(0, MAX_HISTORY);

    this._state.update(HISTORY_KEY, history);
    this._hashSet.add(hash);

    return { added: true, id: hash };
  }

  getHistory() {
    return this._state.get(HISTORY_KEY) || [];
  }

  getSidebarData() {
    return {
      current: this.getCurrentGame(),
      history: this.getHistory(),
    };
  }

  removeHistory(id) {
    const history = this.getHistory().filter(
      (entry) => entry.id !== id
    );

    this._state.update(HISTORY_KEY, history);

    this._hashSet = new Set(
      history.map((g) => g.hash)
    );
  }

  clearHistory() {
    this._state.update(HISTORY_KEY, []);
    this._hashSet.clear();
  }
}

module.exports = { HistoryStore };