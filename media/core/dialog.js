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
  getStartFen,
} from "./history.js";
import { updateCheckHighlight } from "./piece.js";
import { clearAllMarks } from "./marks.js";
import { play, playGameStartSound } from "./sound.js";
import { clearGameEndBadges, showGameEndBadges } from "./gameEndAnimation.js";

// ─── DOM References ──────────────────────────────────────────────────────────
const backdrop = document.getElementById("backdrop");
const downloadDialog = document.getElementById("dialog-export");
const newGameDialog = document.getElementById("dialog-newgame");
const fenInput = document.getElementById("upload-fen-input");
const pgnInput = document.getElementById("upload-pgn-input");
const fileInput = document.getElementById("file-input");
const uploadBtn = document.getElementById("upload-pgn-btn");
const loadGameBtn = document.getElementById("load-game");
const newGameBtn = document.getElementById("new-game");
const dialogNewgameTrigger = document.getElementById("dialog-newgame-trigger");
const dialogExportTrigger = document.getElementById("dialog-export-trigger");
const uploadError = document.getElementById("upload-error");
const exportError = document.getElementById("export-error");
const fenOutputField = document.getElementById("fen-output");
const pgnOutputField = document.getElementById("pgn-output");

// ─── State ──────────────────────────────────────────────────────────────────
let activeDialog = null;

// ─── Dialog Management ─────────────────────────────────────────────────────

/** Open a specific dialog */
export function openDialog(dialogId) {
  if (!backdrop) return;

  closeDialogs();
  uploadError.textContent = "";

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

const STANDARD_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Determine the game-over result tag for the final recorded position,
 *  without disturbing the live `game` object's current state. */
function getResultTag() {
  if (moveHistory.length === 0) return "*";
  const restoreFen = game.fen();
  const finalFen = moveHistory[moveHistory.length - 1].fen;
  let result = "*";
  try {
    // todo game.load(finalFen);
    if (game.isCheckmate()) {
      result = game.turn() === "w" ? "0-1" : "1-0";
    } else if (game.isDraw()) {
      result = "1/2-1/2";
    }
  } catch (e) {
    // ignore
  } finally {
    try {
      // todo game.load(restoreFen);
    } catch (e) {
      // ignore — best-effort restore
    }
  }
  return result;
}

/** Build PGN purely from moveHistory — the only reliable source,
 *  since chess.js's own game.pgn()/game.history() get corrupted
 *  by the game.load() calls used during board navigation. */

function formatPgnDate() {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  return `${year}.${month}.${day}`;
}

export function buildPGNFromHistory() {
  if (moveHistory.length === 0) {
    return "";
  }

  const startFen = getStartFen();
  const blackStarts = startFen.split(" ")[1] === "b";

  let body = "";

  moveHistory.forEach((entry, idx) => {
    const { move } = entry;

    const adjustedIdx = blackStarts ? idx + 1 : idx;
    const moveNumber = Math.ceil((adjustedIdx + 1) / 2);

    if (move.color === "w") {
      body += `${moveNumber}. `;
    } else if (idx === 0 && blackStarts) {
      body += `${moveNumber}... `;
    }

    body += `${move.san} `;
  });

  const result = getResultTag();

  body += result;

  const headers = [
    `[Event "Chanakya Game"]`,
    `[Site "VS Code"]`,
    `[Date "${formatPgnDate()}"]`,
    `[White "White"]`,
    `[Black "Black"]`,
    `[Result "${result}"]`,
  ];

  if (startFen !== STANDARD_START_FEN) {
    headers.push(`[SetUp "1"]`);
    headers.push(`[FEN "${startFen}"]`);
  }

  return `${headers.join("\n")}\n\n${body}`.trim();
}

/** Update the download dialog with current position */
function updateDownloadContent() {
  const fen = game.fen();

  // Get PGN - if game has no moves, try to build from history
  const pgn = buildPGNFromHistory();

  if (fenOutputField) fenOutputField.value = fen;
  if (pgnOutputField) pgnOutputField.value = pgn || "No moves played yet.";
}

/** Copy text to clipboard with feedback */
function copyToClipboard(text, button) {
  if (!text || text === "No moves played yet.") {
    exportError.textContent = "Nothing to copy!";
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
    .catch((err) => handleError(err, "Failed to copy to clipboard"));
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
  const pgn = buildPGNFromHistory();

  if (!pgn || pgn === "No moves played yet.") {
    exportError.textContent = "No moves to download.";
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

export function loadFEN(fen) {
  try {
    game.load(fen);
    renderPosition(game.fen());
    resetHistory(game.fen());
    clearGameEndBadges();
    clearAllMarks();
    updateCheckHighlight();
    goLast();
    closeDialogs();
    playGameStartSound();
    uploadError.textContent = "";
    if(game.isGameOver()) {
      showGameEndBadges();
    }
    return true;
  } catch (e) {
    uploadError.textContent = e.message;
    return false;
  }
}

export function loadPGN(pgn) {
  try {
    // Multi-game file/paste → keep the first game only.
    const firstGame = pgn.split(/\n\s*\n(?=\[Event)/)[0];

    // Reset game first
    game.reset();
    
    // Then load PGN
    game.loadPgn(firstGame);
    
    // Get all moves from the loaded game
    const moves = game.history({ verbose: true });
    
    // Now build history from moves (this should handle the GUI updates)
    buildHistoryFromMoves(moves);
    
    clearGameEndBadges();
    clearAllMarks();
    updateCheckHighlight();
    closeDialogs();
    playGameStartSound();

    uploadError.textContent = "";
    
    if(game.isGameOver()) {
      showGameEndBadges();
    }
    return true;
  } catch (e) {
    uploadError.textContent = e.message;
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
    uploadError.textContent = "Please enter a FEN or PGN.";
    return false;
  }
}

// ─── File Upload ──────────────────────────────────────────────────────────

/** Handle PGN file upload */
function handleFileUpload(file) {
  try {
    // Check if file is empty
    if (file.size === 0) {
      uploadError.textContent = "Error: File is empty (0 bytes). Please select a valid PGN file.";
      return;
    }

    const reader = new FileReader();
    uploadError.textContent = "";

    reader.onload = (e) => {
      try {
        const pgnContent = e.target.result;

        pgnInput.value = pgnContent;
        fenInput.value = "";

        loadGameBtn.disabled = !pgnInput.value.trim() && !fenInput.value.trim();
      } catch (innerError) {
        console.error("Error in onload:", innerError);
        uploadError.textContent =
          "Error processing file: " + innerError.message;
      }
    };

    reader.onerror = () => {
      console.error("FileReader error:", reader.error); // Debug
      uploadError.textContent =
        "Error reading file: " + (reader.error?.message || "Unknown error");
    };

    reader.readAsText(file);
  } catch (e) {
    console.error("Outer catch:", e);
    uploadError.textContent = "Error: " + e.message;
  }
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

  if (fenCopyBtn && fenOutputField) {
    fenCopyBtn.addEventListener("click", () => {
      copyToClipboard(fenOutputField.value, fenCopyBtn);
    });
  }

  if (pgnCopyBtn && pgnOutputField) {
    pgnCopyBtn.addEventListener("click", () => {
      copyToClipboard(pgnOutputField.value, pgnCopyBtn);
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
    uploadError.textContent = "";

    if (hasFenValue) {
      pgnInput.value = "";
    }
  });

  fenInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      loadFromInput();
    }
  });

  pgnInput?.addEventListener("input", () => {
    const hasPgnValue = pgnInput.value.trim();
    const hasFenValue = fenInput.value.trim();

    loadGameBtn.disabled = !hasFenValue && !hasPgnValue;
    uploadError.textContent = "";

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

  [newGameBtn, document.querySelector(".game-over .new-game")].forEach(
    (btn) => {
      btn?.addEventListener("click", () => {
        const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        loadFEN(START_FEN);
      });
    },
  );

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
    fenInput.autofocus = true;
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
    reason = "By Checkmate";

    if (winner === "white") {
      whitePlayer?.classList.add("winner");
    } else {
      blackPlayer?.classList.add("winner");
    }
  } else if (game.isStalemate()) reason = "By Stalemate";
  else if (game.isThreefoldRepetition()) reason = "By threefold repetition";
  else if (game.isInsufficientMaterial()) reason = "By insufficient material";
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