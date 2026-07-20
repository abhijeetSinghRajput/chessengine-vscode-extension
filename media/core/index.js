// index.js
import { ChessUI } from "./ChessUI.js";
import {
  initDialogs,
  openDialog,
  loadFEN,
  loadPGN,
  buildPGNFromHistory,
} from "./dialog.js";
import { initSound, playGameStartSound } from "./sound.js";
import { getVsCodeApi } from "./vscodeApi.js";

const ui = new ChessUI({});

ui.init();
initDialogs();
playGameStartSound();
initSound();

ui.onMove(({ move, fen, turn }) => {
  // console.log("Move played:", move.san, "| FEN:", fen, "| Next:", turn);
});

const vscode = getVsCodeApi();

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
    if (success) {
      vscode?.postMessage({
        command: "commitGameToHistory",
        pgn: buildPGNFromHistory(),
      });
    }
  }
});

vscode?.postMessage({ command: "ready" });

window.__chanakyaUI = ui;
window.__chanakyaOpenDialog = openDialog;
