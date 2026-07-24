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
import { getVsCodeApi } from "./vscodeApi.js";

// DOM References
const backdrop = document.getElementById("backdrop");
const fenInput = document.getElementById("upload-fen-input");
const pgnInput = document.getElementById("upload-pgn-input");
const fileInput = document.getElementById("file-input");
const uploadBtn = document.getElementById("upload-pgn-btn");
const loadGameBtn = document.getElementById("load-game");
const newGameBtn = document.getElementById("new-game");
const dialogNewgameTrigger = document.getElementById("dialog-newgame-trigger");
const dialogExportTrigger = document.getElementById("dialog-export-trigger");
const dialogSettingsTrigger = document.getElementById(
  "dialog-settings-trigger",
);
const uploadError = document.getElementById("upload-error");
const exportError = document.getElementById("export-error");
const fenOutputField = document.getElementById("fen-output");
const pgnOutputField = document.getElementById("pgn-output");

const whiteEngineSelect = document.getElementById("white-engine");
const blackEngineSelect = document.getElementById("black-engine");
const addEngineBtn = document.getElementById("add-engine-btn");
const engineError = document.getElementById("engine-error");

const engineListEl = document.querySelector("#tab-engines .list");
const bookListEl = document.querySelector("#tab-books .list");
const whiteBookSelect = document.getElementById("white-book");
const blackBookSelect = document.getElementById("black-book");
const addBookBtn = document.getElementById("add-book-btn");

const vscode = getVsCodeApi();

let activeDialog = null;

// Dialog Management
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
  if (backdrop) backdrop.classList.remove("active");
  document.querySelectorAll(".dialog.active").forEach((d) => {
    d.classList.remove("active");
  });
  activeDialog = null;
}

// PGN export
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
      m.promotion
        ? { from: m.from, to: m.to, promotion: m.promotion }
        : { from: m.from, to: m.to },
    );
  });
  scratch.header("Result", getResultTag(scratch));
  return scratch.pgn();
}

function renderEngineOptions(engines = [], selected = {}) {
  [
    { select: whiteEngineSelect, side: "w" },
    { select: blackEngineSelect, side: "b" },
  ].forEach(({ select, side }) => {
    if (!select) return;
    const current = selected[side] ?? select.value ?? "builtin";
    select.innerHTML = "";

    const builtinOpt = document.createElement("option");
    builtinOpt.value = "builtin";
    builtinOpt.textContent = "Chanakya (built-in)";
    select.appendChild(builtinOpt);

    engines.forEach((e) => {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = e.name;
      select.appendChild(opt);
    });

    select.value = current;
  });
}

function requestEngineList() {
  vscode?.postMessage({ command: "requestEngineList" });
}

function requestBookList() {
  vscode?.postMessage({ command: "requestBookList" });
}

function trashIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/>
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
}

function renderEngineList(engines = []) {
  if (!engineListEl) return;
  engineListEl.innerHTML = `
    <div class="list-row">
      <div class="list-info">
        <div class="title">⭐ Chanakya (built-in)</div>
        <div class="subtitle">Built-in</div>
      </div>
    </div>`;
  engines.forEach((e) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div class="list-info">
        <div class="title">${e.name}</div>
        <div class="subtitle">${e.fileName}</div>
      </div>
      <button class="btn icon destructive" data-id="${e.id}" data-name="${e.name}">${trashIconSvg()}</button>`;
    row.querySelector("button")?.addEventListener("click", (ev) => {
      const { id, name } = ev.currentTarget.dataset;
      vscode?.postMessage({
        command: "deleteEngine",
        engineId: id,
        engineName: name,
      });
    });
    engineListEl.appendChild(row);
  });
}

function renderBookList(books = []) {
  if (!bookListEl) return;
  bookListEl.innerHTML = `
    <div class="list-row">
      <div class="list-info">
        <div class="title">Default Book</div>
        <div class="subtitle">performance.bin</div>
      </div>
    </div>`;
  books.forEach((b) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div class="list-info">
        <div class="title">${b.name}</div>
        <div class="subtitle">${b.fileName}</div>
      </div>
      <button class="btn icon destructive" data-id="${b.id}" data-name="${b.name}">${trashIconSvg()}</button>`;
    row.querySelector("button")?.addEventListener("click", (ev) => {
      const { id, name } = ev.currentTarget.dataset;
      vscode?.postMessage({
        command: "deleteBook",
        bookId: id,
        bookName: name,
      });
    });
    bookListEl.appendChild(row);
  });
}

function renderBookOptions(books = [], selected = {}) {
  [
    { select: whiteBookSelect, side: "w" },
    { select: blackBookSelect, side: "b" },
  ].forEach(({ select, side }) => {
    if (!select) return;
    const current = selected[side] ?? "default";
    select.innerHTML = "";
    [
      ["none", "None"],
      ["default", "Default Book"],
    ].forEach(([value, label]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    });
    books.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.name;
      select.appendChild(opt);
    });
    select.value = current;
  });
}

function updateDownloadContent() {
  const fen = game.fen();
  const pgn = buildPGNFromHistory();
  if (fenOutputField) fenOutputField.value = fen;
  if (pgnOutputField) pgnOutputField.value = pgn || "No moves played yet.";
}

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
  if (button._copyTimeout) clearTimeout(button._copyTimeout);
  button._copyTimeout = setTimeout(() => {
    button.classList.remove("copied");
    button._copyTimeout = null;
    button.disabled = false;
  }, 3000);
}

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

// Consolidated load function - handles both FEN and PGN
export function loadGame({ fen, pgn } = {}) {
  try {
    if (fen) {
      resetGame(fen);
      resetHeaders();
      resetHistory(game.fen());
      renderPosition(game.fen());
      closeDialogs();
      playGameStartSound();
      if (game.isGameOver()) showGameEndBadges();
      return true;
    } else if (pgn) {
      const firstGame = pgn.split(/\n\s*\n(?=\[Event)/)[0];
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
      closeDialogs();
      playGameStartSound();
      if (game.isGameOver()) showGameEndBadges();
      return true;
    }
    return false;
  } catch (e) {
    uploadError.textContent = e.message;
    return false;
  }
}

// Deprecated - use loadGame instead
export const loadFEN = (fen) => loadGame({ fen });
export const loadPGN = (pgn) => loadGame({ pgn });

function loadFromInput() {
  const fen = fenInput.value.trim();
  const pgn = pgnInput.value.trim();
  if (fen) return loadFEN(fen);
  else if (pgn) return loadPGN(pgn);
  else {
    uploadError.textContent = "Please enter a FEN or PGN.";
    return false;
  }
}

function handleFileUpload(file) {
  try {
    if (file.size === 0) {
      uploadError.textContent =
        "Error: File is empty (0 bytes). Please select a valid PGN file.";
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
    if (winner === "white") whitePlayer?.classList.add("winner");
    else blackPlayer?.classList.add("winner");
  } else if (game.isStalemate()) reason = "By Stalemate";
  else if (game.isThreefoldRepetition()) reason = "By threefold repetition";
  else if (game.isInsufficientMaterial()) reason = "By insufficient material";
  else if (game.isDraw()) reason = "50-move rule";

  uiTitle.textContent = title;
  uiSubTitle.textContent = reason;
  openDialog("dialog-gameover");
}

// Event Listeners
export function initDialogs() {
  if (!backdrop) return;

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeDialogs();
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
    if (hasFenValue) pgnInput.value = "";
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
    if (hasPgnValue) fenInput.value = "";
  });

  uploadBtn?.addEventListener("click", () => fileInput.click());

  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
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
    if (e.key === "Escape") closeDialogs();
    if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e")) {
      e.preventDefault();
      openDialog("dialog-export");
    }
  });

  dialogNewgameTrigger?.addEventListener("click", () => {
    setTimeout(() => fenInput.focus(), 200);
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

  dialogSettingsTrigger?.addEventListener("click", () => {
    openDialog("dialog-settings");
    requestEngineList();
    requestBookList();
  });

  addEngineBtn?.addEventListener("click", () => {
    if (engineError) engineError.textContent = "";
    vscode?.postMessage({ command: "addUciEngine" });
  });
  whiteEngineSelect?.addEventListener("change", () => {
    vscode?.postMessage({
      command: "selectEngine",
      side: "w",
      engineId: whiteEngineSelect.value,
    });
  });
  blackEngineSelect?.addEventListener("change", () => {
    vscode?.postMessage({
      command: "selectEngine",
      side: "b",
      engineId: blackEngineSelect.value,
    });
  });

  addBookBtn?.addEventListener("click", () => {
    vscode?.postMessage({ command: "addBook" });
  });

  whiteBookSelect?.addEventListener("change", () => {
    vscode?.postMessage({
      command: "selectBook",
      side: "w",
      bookId: whiteBookSelect.value,
    });
  });
  blackBookSelect?.addEventListener("change", () => {
    vscode?.postMessage({
      command: "selectBook",
      side: "b",
      bookId: blackBookSelect.value,
    });
  });

  addBookBtn?.addEventListener("click", () => {
    vscode?.postMessage({ command: "addBook" });
  });

  whiteBookSelect?.addEventListener("change", () => {
    vscode?.postMessage({
      command: "selectBook",
      side: "w",
      bookId: whiteBookSelect.value,
    });
  });
  blackBookSelect?.addEventListener("change", () => {
    vscode?.postMessage({
      command: "selectBook",
      side: "b",
      bookId: blackBookSelect.value,
    });
  });
}

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.command === "engineListUpdated") {
    renderEngineOptions(msg.engines, msg.selected || {});
    renderEngineList(msg.engines);
  }

  if (msg.command === "engineAddFailed") {
    if (engineError)
      engineError.textContent = msg.error || "Failed to add engine.";
  }
  if (msg.command === "bookListUpdated") {
    renderBookOptions(msg.books, msg.selected || {});
    renderBookList(msg.books);
  }
  if (msg.command === "bookAddFailed") {
    const bookError = document.getElementById("book-error"); // add this element next to add-book-btn, mirroring engine-error
    if (bookError) bookError.textContent = msg.error || "Failed to add book.";
  }
});

export default {
  openDialog,
  closeDialogs,
  downloadPGN,
  loadFEN,
  loadPGN,
  loadGame,
  initDialogs,
};
