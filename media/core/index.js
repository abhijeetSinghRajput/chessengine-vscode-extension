/**
 * index.js — application entry point.
 *
 * This file is intentionally thin. All logic lives in ChessUI.js and its
 * imported modules. The engine itself is resolved on the extension-host
 * side (see extension.js + engine/EnginePool.js) — nothing here needs to
 * know a path or URL.
 */

import { ChessUI } from "./ChessUI.js";
import { initDialogs, openDialog, loadFEN, loadPGN, buildPGNFromHistory } from "./dialog.js";
import { initSound, playGameStartSound } from "./sound.js";
import { getVsCodeApi } from "./vscodeApi.js";

const ui = new ChessUI({});

ui.init();
initDialogs();
playGameStartSound();
initSound();

// ── React to moves (hook point for analytics, clocks, game-over UI, …) ───────
ui.onMove(({ move, fen, turn }) => {
  // console.log("Move played:", move.san, "| FEN:", fen, "| Next:", turn);
});

const vscode = getVsCodeApi();

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

    // Uploaded/pasted PGN → straight into history (deduped host-side by
    // content hash), independent of the per-move autosave in ChessUI.js.
    if (success) {
      vscode?.postMessage({
        command: "commitGameToHistory",
        pgn: buildPGNFromHistory(),
      });
    }
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