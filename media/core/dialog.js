// dialog.js
import { Chess } from "../vendor/chess.esm.js";
import {
  game,
  resetGame,
  START_FEN,
  getHeaders,
  setHeaders,
  resetHeaders,
} from "./game.js";
import { renderPosition } from "./board.js";
import {
  resetHistory,
  moves,
  getStartFen,
  buildHistoryFromMoves,
} from "./history.js";
import { updateCheckHighlight } from "./piece.js";
import { clearAllMarks } from "./marks.js";
import { playGameStartSound } from "./sound.js";
import { clearGameEndBadges, showGameEndBadges } from "./gameEndAnimation.js";

// ─── DOM References ──────────────────────────────────────────────────────────
const backdrop = document.getElementById("backdrop");
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

export function closeDialogs() {
  if (backdrop) {
    backdrop.classList.remove("active");
  }

  document.querySelectorAll(".dialog.active").forEach((d) => {
    d.classList.remove("active");
  });

  activeDialog = null;
}

// ─── PGN export ─────────────────────────────────────────────────────────
// Built on a throw-away *scratch* Chess instance, replaying `moves` from
// `startFen`. This is the key fix over the old approach: it never has to
// load/restore FEN on the live `game`, so it can't desync navigation, and
// it always exports the FULL game regardless of where the user has
// scrubbed to in history.
function getResultTag(finalPositionGame) {
  if (finalPositionGame.isCheckmate()) {
    return finalPositionGame.turn() === "w" ? "0-1" : "1-0";
  }
  if (finalPositionGame.isDraw()) return "1/2-1/2";
  return "*";
}

export function buildPGNFromHistory() {
  if (moves.length === 0) return "";

  const scratch = new Chess();
  scratch.load(getStartFen());

  Object.entries(getHeaders()).forEach(([k, v]) => {
    if (v != null) scratch.header(k, v);
  });

  moves.forEach((m) => {
    scratch.move(
      m.promotion ? { from: m.from, to: m.to, promotion: m.promotion } : { from: m.from, to: m.to },
    );
  });

  scratch.header("Result", getResultTag(scratch));

  return scratch.pgn();
}

/** Update the download dialog with current position */
function updateDownloadContent() {
  const fen = game.fen();
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
    .catch((err) => console.error("Failed to copy to clipboard", err));
}

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

// ─── New Game / Load Dialog ─────────────────────────────────────────────

export function loadFEN(fen) {
  try {
    resetGame(fen); // validates + loads — throws on bad FEN
    resetHeaders();
    renderPosition(game.fen());
    resetHistory(game.fen());
    clearGameEndBadges();
    clearAllMarks();
    updateCheckHighlight();
    goLastSafe();
    closeDialogs();
    playGameStartSound();
    uploadError.textContent = "";
    if (game.isGameOver()) {
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

    // Parse on a scratch instance — never risk corrupting the live `game`
    // with a PGN that turns out to be malformed halfway through.
    const scratch = new Chess();
    scratch.loadPgn(firstGame);

    const verboseMoves = scratch.history({ verbose: true });
    const scratchHeaders = scratch.header();
    const customStartFen = scratchHeaders.FEN || START_FEN;

    resetHeaders();
    setHeaders({
      Event: scratchHeaders.Event,
      Site: scratchHeaders.Site,
      Date: scratchHeaders.Date,
      Round: scratchHeaders.Round,
      White: scratchHeaders.White,
      Black: scratchHeaders.Black,
      Result: scratchHeaders.Result,
    });

    buildHistoryFromMoves(verboseMoves, customStartFen);

    clearGameEndBadges();
    clearAllMarks();
    updateCheckHighlight();
    closeDialogs();
    playGameStartSound();

    uploadError.textContent = "";

    if (game.isGameOver()) {
      showGameEndBadges();
    }
    return true;
  } catch (e) {
    uploadError.textContent = e.message;
    return false;
  }
}

// goLast is defined in history.js but importing it directly here would
// create a needless extra binding just for the "did we already build a
// fresh empty history" case in loadFEN — a no-op when moves.length === 0.
function goLastSafe() {
  // resetHistory() already leaves currentIndex at -1 for a fresh game,
  // which IS "last" when there are no moves yet — nothing further to do.
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

function handleFileUpload(file) {
  try {
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
        uploadError.textContent = "Error processing file: " + innerError.message;
      }
    };

    reader.onerror = () => {
      console.error("FileReader error:", reader.error);
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

  const downloadBtn = document.querySelector(
    "#dialog-export .dialog-footer .btn.primary",
  );
  downloadBtn?.addEventListener("click", downloadPGN);

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

  loadGameBtn?.addEventListener("click", loadFromInput);

  [newGameBtn, document.querySelector(".game-over .new-game")].forEach(
    (btn) => {
      btn?.addEventListener("click", () => {
        loadFEN(START_FEN);
      });
    },
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDialogs();
    }

    if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e")) {
      e.preventDefault();
      openDialog("dialog-export");
    }
  });

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