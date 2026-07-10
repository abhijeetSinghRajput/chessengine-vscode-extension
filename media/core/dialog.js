// dialog.js
import { game } from "./game.js";
import { renderPosition } from "./board.js";
import {
  resetHistory,
  goLast,
  recordMove,
  moveHistory,
  renderHistory,
  buildHistoryFromMoves,
  getCurrentIndex,
  getHistoryLength,
} from "./history.js";
import { updateCheckHighlight } from "./piece.js";
import { clearAllMarks } from "./marks.js";
import { play } from "./sound.js";

// ─── DOM References ──────────────────────────────────────────────────────────
const backdrop = document.getElementById("backdrop");
const downloadDialog = document.getElementById("dialog-export");
const newGameDialog = document.getElementById("dialog-newgame");
const fenInput = document.getElementById("upload-fen-input");
const pgnInput = document.getElementById("upload-pgn-input");
const fileInput = document.getElementById("file-input");
const uploadBar = document.getElementById("upload-bar");
const uploadBtn = document.getElementById("upload-pgn-btn");
const loadGameBtn = document.getElementById("load-game");
const newGameBtn = document.getElementById("new-game");
const dialogNewgameTrigger = document.getElementById("dialog-newgame-trigger");
const dialogExportTrigger = document.getElementById("dialog-export-trigger");

// ─── State ──────────────────────────────────────────────────────────────────
let activeDialog = null;

// ─── Dialog Management ─────────────────────────────────────────────────────

/** Open a specific dialog */
export function openDialog(dialogId) {
  if (!backdrop) return;

  closeDialogs();

  backdrop.classList.add("active");

  const dialog = document.getElementById(dialogId);
  if (dialog) {
    dialog.classList.add("active");
    activeDialog = dialogId;

    if (dialogId === "dialog-export") {
      updateDownloadContent();
    }
  }
}

/** Close all dialogs */
export function closeDialogs() {
  if (backdrop) {
    backdrop.classList.remove("active");
  }

  document.querySelectorAll(".dialog.active").forEach((d) => {
    d.classList.remove("active");
  });

  activeDialog = null;
}

// ─── Download Dialog ──────────────────────────────────────────────────────

/** Update the download dialog with current position */
function updateDownloadContent() {
  const fen = game.fen();

  // Get PGN - if game has no moves, try to build from history
  let pgn = game.pgn();

  // If PGN is empty but we have history moves, build PGN manually
  if (!pgn || pgn.trim() === "") {
    pgn = buildPGNFromHistory();
  }

  const fenField = document.querySelector("#dialog-export .fen input");
  const pgnField = document.getElementById("pgn-textarea");

  if (fenField) fenField.value = fen;
  if (pgnField) pgnField.value = pgn || "No moves played yet.";
}

/** Build PGN from the move history */
function buildPGNFromHistory() {
  const moves = game.history({ verbose: true });
  if (!moves || moves.length === 0) {
    // Try to build from moveHistory
    if (moveHistory.length === 0) {
      return "No moves played yet.";
    }

    // Build PGN from moveHistory
    let pgn = "";
    let moveNumber = 1;

    for (let i = 0; i < moveHistory.length; i++) {
      const entry = moveHistory[i];
      const move = entry.move;

      if (move.color === "w") {
        pgn += `${moveNumber}. `;
      }

      pgn += move.san + " ";

      if (move.color === "b") {
        moveNumber++;
      }
    }

    return pgn.trim() || "No moves played yet.";
  }

  // Build PGN string from game history
  let pgn = "";
  let moveNumber = 1;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];

    if (move.color === "w") {
      pgn += `${moveNumber}. `;
    }

    pgn += move.san + " ";

    if (move.color === "b") {
      moveNumber++;
    }
  }

  // Add result if game is over
  if (game.isGameOver()) {
    if (game.isCheckmate()) {
      pgn += game.turn() === "w" ? "0-1" : "1-0";
    } else if (game.isDraw()) {
      pgn += "1/2-1/2";
    }
  }

  return pgn.trim() || "No moves played yet.";
}

/** Copy text to clipboard with feedback */
function copyToClipboard(text, button) {
  if (!text || text === "No moves played yet.") {
    alert("Nothing to copy!");
    return;
  }

  if (!navigator.clipboard) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    showCopyFeedback(button);
    return;
  }

  navigator.clipboard
    .writeText(text)
    .then(() => showCopyFeedback(button))
    .catch((err) => console.error("Failed to copy:", err));
}

/** Show copy feedback (3 second acknowledgement) */
function showCopyFeedback(button) {
  if (!button) return;

  button.classList.add("copied");
  button.disabled = true;

  if (button._copyTimeout) {
    clearTimeout(button._copyTimeout);
  }

  button._copyTimeout = setTimeout(() => {
    button.classList.remove("copied");
    button._copyTimeout = null;
    button.disabled = false;
  }, 3000);
}

/** Download PGN as a file */
export function downloadPGN() {
  let pgn = game.pgn();

  if (!pgn || pgn.trim() === "") {
    pgn = buildPGNFromHistory();
  }

  if (!pgn || pgn === "No moves played yet.") {
    alert("No moves to download.");
    return;
  }

  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const filename = `chess_game_${dateStr}.pgn`;

  const blob = new Blob([pgn], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── New Game Dialog ──────────────────────────────────────────────────────

/** Load a FEN string */
function loadFEN(fen) {
  try {
    game.load(fen);
    renderPosition(game.fen());
    resetHistory();
    clearAllMarks();
    updateCheckHighlight();
    goLast();
    closeDialogs();
    play("game-start");
    return true;
  } catch (e) {
    alert(`Invalid FEN: ${e.message}`);
    return false;
  }
}

/** Load PGN string */
function loadPGN(pgn) {
  try {
    // Load PGN into chess.js
    game.loadPgn(pgn);

    // Get all moves from the loaded game
    const moves = game.history({ verbose: true });

    // Reset game to start
    game.reset();

    // Build history from moves - this now handles GUI updates
    buildHistoryFromMoves(moves);

    closeDialogs();
    return true;
  } catch (e) {
    alert(`Invalid PGN: ${e.message}`);
    return false;
  }
}

/** Parse and load from combined input (FEN or PGN) */
function loadFromInput() {
  const fen = fenInput.value.trim();
  const pgn = pgnInput.value.trim();

  if (fen) {
    return loadFEN(fen);
  } else if (pgn) {
    return loadPGN(pgn);
  } else {
    alert("Please enter a FEN or PGN.");
    return false;
  }
}

// ─── File Upload ──────────────────────────────────────────────────────────

/** Handle PGN file upload */
function handleFileUpload(file) {
  const reader = new FileReader();

  reader.onprogress = (e) => {
    if (e.lengthComputable) {
      const progress = (e.loaded / e.total) * 100;
      uploadBar.style.width = progress + "%";
    }
  };

  reader.onload = (e) => {
    uploadBar.style.width = "100%";
    const pgnContent = e.target.result;
    pgnInput.value = pgnContent;
    fenInput.value = "";

    loadGameBtn.disabled = !pgnInput.value.trim() && !fenInput.value.trim();

    setTimeout(() => {
      uploadBar.style.width = "0%";
    }, 1000);
  };

  reader.onerror = () => {
    alert("Error reading file.");
    uploadBar.style.width = "0%";
  };

  reader.readAsText(file);
}

// ─── Event Listeners ─────────────────────────────────────────────────────

/** Initialize all dialog event listeners */
export function initDialogs() {
  if (!backdrop) return;

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      closeDialogs();
    }
  });

  document.querySelectorAll(".dialog-close").forEach((btn) => {
    btn.addEventListener("click", closeDialogs);
  });

  // Copy buttons
  const fenCopyBtn = document.getElementById("copy-fen");
  const pgnCopyBtn = document.getElementById("copy-pgn");
  const fenInputField = document.getElementById("fen-input");
  const pgnInputField = document.getElementById("pgn-textarea");

  if (fenCopyBtn && fenInputField) {
    fenCopyBtn.addEventListener("click", () => {
      copyToClipboard(fenInputField.value, fenCopyBtn);
    });
  }

  if (pgnCopyBtn && pgnInputField) {
    pgnCopyBtn.addEventListener("click", () => {
      copyToClipboard(pgnInputField.value, pgnCopyBtn);
    });
  }

  // Download button
  const downloadBtn = document.querySelector(
    "#dialog-export .dialog-footer .btn.primary",
  );
  downloadBtn?.addEventListener("click", downloadPGN);

  // FEN/PGN input sync
  fenInput?.addEventListener("input", () => {
    const hasPgnValue = pgnInput.value.trim();
    const hasFenValue = fenInput.value.trim();

    loadGameBtn.disabled = !hasFenValue && !hasPgnValue;

    if (hasFenValue) {
      pgnInput.value = "";
    }
  });

  pgnInput?.addEventListener("input", () => {
    const hasPgnValue = pgnInput.value.trim();
    const hasFenValue = fenInput.value.trim();

    loadGameBtn.disabled = !hasFenValue && !hasPgnValue;

    if (hasPgnValue) {
      fenInput.value = "";
    }
  });

  // File upload
  uploadBtn?.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
    fileInput.value = "";
  });

  // Load Game buttons
  loadGameBtn?.addEventListener("click", loadFromInput);

  [
    newGameBtn,
    document.querySelector(".game-over .new-game"), 
  ].forEach((btn) => {
    btn?.addEventListener("click", () => {
      const START_FEN =
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      loadFEN(START_FEN);
    });
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDialogs();
    }

    if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e")) {
      e.preventDefault();
      openDialog("dialog-export");
    }
  });

  // Open dialogs from sidebar
  dialogNewgameTrigger?.addEventListener("click", () => {
    openDialog("dialog-newgame");
  });

  dialogExportTrigger?.addEventListener("click", () => {
    openDialog("dialog-export");
  });

  document
    .querySelector(".game-over .export")
    ?.addEventListener("click", () => {
      openDialog("dialog-export");
    });
}

// ─── Public API ──────────────────────────────────────────────────────────

export function showGameOverDialog(move) {
  const uiTitle = document.querySelector(".game-over .title");
  const uiSubTitle = document.querySelector(".game-over .subtitle");
  const whitePlayer = document.querySelector(".game-over .player.white");
  const blackPlayer = document.querySelector(".game-over .player.black");

  // Clear previous winner state
  whitePlayer?.classList.remove("winner");
  blackPlayer?.classList.remove("winner");

  let title = "Draw";
  let reason = "Game over";

  if (game.isCheckmate()) {
    const winner = move.color === "w" ? "white" : "black";

    title = `${winner} won`;
    reason = "Checkmate";

    if (winner === "white") {
      whitePlayer?.classList.add("winner");
    } else {
      blackPlayer?.classList.add("winner");
    }
  } else if (game.isStalemate()) reason = "stalemate";
  else if (game.isThreefoldRepetition()) reason = "threefold repetition";
  else if (game.isInsufficientMaterial()) reason = "insufficient material";
  else if (game.isDraw()) reason = "50-move rule";

  uiTitle.textContent = title;
  uiSubTitle.textContent = reason;
  openDialog("dialog-gameover");
}

export default {
  openDialog,
  closeDialogs,
  downloadPGN,
  loadFEN,
  loadPGN,
  initDialogs,
};
