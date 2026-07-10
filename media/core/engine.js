/**
 * engine.js
 * ────────────────────────────────────────────────────────────────────────
 * Bridge between the chess UI and the extension host's local UCI engine
 * (chess.exe). No HTTP, no fetch() — webviews can't reach a local server
 * or spawn processes directly, so every request goes through
 * vscode.postMessage() and is answered asynchronously via
 * window.addEventListener("message", ...).
 *
 * Public API is intentionally unchanged from the original fetch-based
 * version so bot.js does not need to know anything changed:
 *
 *   fetchMove(endpointOrSlot, payload) → Promise<{bestMove, depth, time, nodes}>
 *
 * `endpointOrSlot` used to be a URL; it's now read as an engine "slot" key
 * ("w" | "b" | "default") so White-bot and Black-bot can each get their own
 * warm engine process from the pool. Pass "w" / "b" from bot.js — see
 * ChessUI.js where BotController is constructed.
 */

// Acquired once per webview session. Calling this twice throws, so guard it.
const vscode = window.__chanakyaVsCodeApi ?? (window.__chanakyaVsCodeApi = acquireVsCodeApi());

let reqId = 0;
const pending = new Map(); // id -> { resolve, reject }

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.command === "bestMove" || msg.command === "engineError") {
    const waiter = pending.get(msg.id);
    if (!waiter) return; // stale/duplicate response, ignore
    pending.delete(msg.id);

    if (msg.command === "bestMove") {
      waiter.resolve(msg.data);
    } else {
      waiter.reject(new Error(msg.error || "Engine error"));
    }
  }
});

/**
 * Ask the local engine (via the extension host) for the best move.
 *
 * @param {string} slot     - "w" | "b" | "default" — which pooled engine to use
 * @param {object} payload  - { fen, moves, movetime?, depth?, wtime?, btime?, winc?, binc? }
 * @returns {Promise<{bestMove:string, depth:number, time:number, nodes:number}>}
 */
export function fetchMove(slot, payload) {
  const id = ++reqId;

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    vscode.postMessage({ command: "getMove", id, slot, payload });

    // Safety timeout in case the extension host never replies
    // (e.g. engine crashed). Keeps the "thinking…" UI from hanging forever.
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("Engine request timed out."));
      }
    }, 60_000);
  });
}

/** Tell the extension host to reset all pooled engines (new game). */
export function notifyNewGame() {
  vscode.postMessage({ command: "newGame" });
}

/** Ask the extension host to abort any in-flight searches. */
export function stopSearch() {
  vscode.postMessage({ command: "stopSearch" });
}
