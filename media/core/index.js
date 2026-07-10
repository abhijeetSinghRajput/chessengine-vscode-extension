/**
 * index.js — application entry point.
 *
 * This file is intentionally thin. All logic lives in ChessUI.js and its
 * imported modules. The engine itself is resolved on the extension-host
 * side (see extension.js + engine/EnginePool.js) — nothing here needs to
 * know a path or URL.
 */

import { ChessUI } from "./ChessUI.js";
import { initDialogs, openDialog } from "./dialog.js";
import { playGameStart } from "./sound.js";

const ui = new ChessUI({});

ui.init();
initDialogs();
playGameStart();

// ── React to moves (hook point for analytics, clocks, game-over UI, …) ───────
ui.onMove(({ move, fen, turn }) => {
  // console.log("Move played:", move.san, "| FEN:", fen, "| Next:", turn);
});

// ── Commands issued from the extension host (Command Palette entries) ───────
window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.command !== "uiCommand") return;

  if (msg.action === "newGame") ui.resetGame();
  if (msg.action === "flipBoard") ui.flipBoard();
});

// Expose on window for debugging from the webview's dev tools
// (Help > Toggle Developer Tools, then find the "Chanakya" webview frame).
window.__chanakyaUI = ui;
window.__chanakyaOpenDialog = openDialog;
