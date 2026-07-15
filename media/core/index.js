/**
 * index.js — application entry point.
 *
 * This file is intentionally thin. All logic lives in ChessUI.js and its
 * imported modules. The engine itself is resolved on the extension-host
 * side (see extension.js + engine/EnginePool.js) — nothing here needs to
 * know a path or URL.
 */

import { ChessUI } from "./ChessUI.js";
import { initDialogs, openDialog, loadFEN, loadPGN } from "./dialog.js";
import { initSound, playGameStart } from "./sound.js";

const ui = new ChessUI({});

ui.init();
initDialogs();
playGameStart();
initSound();

// ── React to moves (hook point for analytics, clocks, game-over UI, …) ───────
ui.onMove(({ move, fen, turn }) => {
  // console.log("Move played:", move.san, "| FEN:", fen, "| Next:", turn);
});

// ── vscode API — guarded, since acquireVsCodeApi() may only be called once
// per webview and something else in this panel (ChessUI.js?) may already
// hold the reference. If you see a "acquireVsCodeApi already called" error,
// swap this for whatever singleton your codebase already uses. ────────────
const vscode =
  window.__chanakyaVsCodeApi ||
  (window.__chanakyaVsCodeApi =
    typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null);

// ── Commands issued from the extension host (Command Palette entries,
// and now the sidebar's New Game tab) ────────────────────────────────────
window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.command !== "uiCommand") return;

  if (msg.action === "newGame") ui.resetGame();
  if (msg.action === "flipBoard") ui.flipBoard();

  if (msg.action === "loadFen") {
    const success = loadFEN(msg.fen);
    vscode?.postMessage({
      command: "loadFenResult",
      success,
      error: success ? undefined : "Invalid FEN.",
    });
  }

  if (msg.action === "loadPgn") {
    const success = loadPGN(msg.pgn);
    vscode?.postMessage({
      command: "loadPgnResult",
      success,
      error: success ? undefined : "Invalid PGN.",
    });
  }
});

// Tell the host we're listening — lets extension.js flush any sidebar
// action (New Game / FEN / PGN) that arrived before this webview finished
// loading, instead of it being silently dropped.
vscode?.postMessage({ command: "ready" });

// Expose on window for debugging from the webview's dev tools
// (Help > Toggle Developer Tools, then find the "Chanakya" webview frame).
window.__chanakyaUI = ui;
window.__chanakyaOpenDialog = openDialog;