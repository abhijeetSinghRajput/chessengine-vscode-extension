// board.js
import { parseFen } from "./fen.js";
import { addPiece } from "./piece.js";

export const domBoard = document.querySelector('#board');
export const pieceLayer = domBoard.querySelector('#board .piece-layer')
export const squareLayer = domBoard.querySelector('#board .square-layer')
export const markLayer = domBoard.querySelector('#board .mark-layer')
export const FILES = 'abcdefgh';

export const initBoard = () => {
    for(let i = 0; i<8; ++i){
        for(let j = 0; j<8; ++j){
            const domSquare = document.createElement('div');
            const color = (i + j ) % 2 === 0? "light" : "dark";

            domSquare.dataset.square = FILES[j] + (i + 1);
            domSquare.classList.add('square', color);

            squareLayer.append(domSquare);
        }
    }
}

export const renderPosition = (fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") => {
    document.querySelectorAll('.piece-layer .piece').forEach(piece=>piece.remove());
    const position = parseFen(fen);
    for(const sq in position){
        const piece = position[sq];
        addPiece(sq, piece);
    }
}

export const resetBoard = () => {
    // clear the board (Piece and marks )
    pieceLayer.childNodes.forEach(e=>e.remove());
    markLayer.childNodes.forEach(e=>e.remove());

    guiPieces = {};
    renderPosition();
}
/**
 * bot.js
 * Per-side engine bot controller.
 *
 * Flow:
 *   1. User toggles the bot ON
 *      → if it's already this bot's turn, fire immediately
 *   2. After any move (human or bot), ChessUI calls _triggerBots()
 *      → the bot whose turn it is calls maybeMove → engine (via postMessage) → executeMove
 *   3. Loader (.player.thinking) is shown for the duration of the request
 *
 * NOTE: `endpoint` from the original fetch-based version is now unused —
 * the engine lives in the extension host, not behind an HTTP URL. Requests
 * are routed by `slot` (defaults to this bot's color) so White-bot and
 * Black-bot each get their own warm engine process from the pool.
 */

import { fetchMove } from "./engine.js";
import { setThinking, setDepthBadge, setMoveTime } from "./ui.js";

export class BotController {
  /**
   * @param {"w"|"b"}  color
   * @param {string}   endpoint      - unused (kept for signature compatibility)
   * @param {Function} getGameState  - () => { fen: string, uciMoves: string[], turn: "w"|"b" }
   * @param {Function} executeMove   - (from, to, promo?) => Promise<move|null>
   */
  constructor(color, endpoint, getGameState, executeMove) {
    this.color = color;
    this.slot = color; // engine pool key — "w" or "b"
    this._getState = getGameState;
    this._exec = executeMove;
    this.enabled = false;
    this._movetime = 1000; // ms — default 1 s
    this._busy = false;
  }

  /**
   * Wire toggle button and time select to the DOM.
   *
   * @param {string} toggleSelector
   * @param {string} selectSelector  - <select> values are seconds
   */
  init(toggleSelector, selectSelector) {
    const toggle = document.querySelector(toggleSelector);
    const select = document.querySelector(selectSelector);

    if (select) {
      this._movetime = (Number(select.value) || 1) * 1000;
      select.addEventListener("change", () => {
        this._movetime = (Number(select.value) || 1) * 1000;
      });
    }

    if (toggle) {
      toggle.addEventListener("click", () => {
        this.enabled = !this.enabled;
        toggle.classList.toggle("active", this.enabled);

        // If toggled ON and it's already our turn, go immediately
        if (this.enabled) {
          const { turn } = this._getState();
          if (turn === this.color) this.maybeMove();
        }
      });
    }
  }

  /**
   * Call after every completed move (from ChessUI._triggerBots).
   * No-ops if: disabled, wrong turn, or already busy.
   */
  async maybeMove() {
    const { fen, uciMoves, turn } = this._getState();

    if (!this.enabled || turn !== this.color || this._busy) {
      return;
    }

    this._busy = true;
    setThinking(this.color, true);

    // Clear previous depth and time
    setDepthBadge(this.color, "");
    setMoveTime(this.color, "", "");

    try {
      const { bestMove, depth, time, nodes } = await fetchMove(this.slot, {
        fen,
        moves: uciMoves,
        movetime: this._movetime,
      });

      const from = bestMove.slice(0, 2);
      const to = bestMove.slice(2, 4);
      const promotion = bestMove.length === 5 ? bestMove[4] : undefined;

      // Update UI with depth and time
      setDepthBadge(this.color, depth);
      setMoveTime(this.color, time, nodes);

      await this._exec(from, to, promotion);
    } catch (err) {
      console.error(`[Bot ${this.color}] engine error:`, err);
    } finally {
      this._busy = false;
      setThinking(this.color, false);
    }
  }
}
/**
 * ChessUI.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Single entry point for the chess UI library.
 *
 * Usage
 * ─────
 *   import { ChessUI } from "./ChessUI.js";
 *
 *   const ui = new ChessUI({ endpoint: "" }); // endpoint is unused in the
 *                                              // extension build — engine
 *                                              // requests are routed to the
 *                                              // extension host, not a URL.
 *   ui.init();
 *
 * Public API
 * ──────────
 *   ui.init()                    — mount board, wire bots, start listening
 *   ui.resetGame()               — full board + history reset
 *   ui.loadFen(fen)              — load an arbitrary position
 *   ui.onMove(fn)                — register callback fired after every move
 *                                  fn({ move, fen, turn }) — move = chess.js move obj
 *   ui.getBotController(color)   — get BotController instance ("w"|"b")
 *
 * DOM contract (see index.html)
 * ─────────────────────────────
 *   #board                          — board root
 *   .player[data-color="w|b"]       — player panels
 *   .player[data-color="w|b"] select — depth picker
 *   #whiteBot / #blackBot           — toggle buttons
 *   .history-moves                  — move list
 *   .nav-first/prev/next/last       — nav buttons
 *   button.flip                     — flip board
 *   .promotion-window.white/black   — promotion pickers
 */

import { domBoard, initBoard, renderPosition } from "./board.js";
import {
  handleBoardClick,
  initPieceLayer,
  executeMove as _exec,
} from "./piece.js";
import {
  initHistory,
  goBack,
  goForward,
  goFirst,
  goLast,
  resetHistory,
  setOnMoveCallback,
} from "./history.js";
import { game } from "./game.js";
import { BotController } from "./bot.js";
import { clearAllMarks } from "./marks.js";
import { updateCheckHighlight } from "./piece.js";
import { notifyNewGame } from "./engine.js";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export class ChessUI {
  /**
   * @param {Object} options
   * @param {string} [options.endpoint] - unused in the extension build (kept for API compatibility)
   */
  constructor({ endpoint = "" } = {}) {
    this._endpoint = endpoint;
    this._moveListeners = [];

    // Create getState function for bots
    const getState = () => ({
      fen: game.fen(),
      uciMoves: this._uciMoveList(),
      turn: game.turn(),
    });

    // Bot controllers — created now, init()'d later once DOM is ready
    this._bots = {
      w: new BotController(
        "w",
        endpoint,
        getState,
        this._executeMoveAndNotify.bind(this),
      ),
      b: new BotController(
        "b",
        endpoint,
        getState,
        this._executeMoveAndNotify.bind(this),
      ),
    };

    // Set callback for when any move is recorded (human or bot)
    setOnMoveCallback(() => {
      this._triggerBots();
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Mount the board and wire up all event listeners.
   * Call once after the DOM is ready.
   */
  init() {
    initBoard();
    initPieceLayer();

    this._loadPosition();

    initHistory();
    this._bindBots();
    this._bindBoardEvents();
    this._bindKeyboard();
  }

  /** Full reset: clear history, reload start position. */
  resetGame() {
    this._loadPosition(START_FEN, true);
    notifyNewGame();
  }

  /** Load an arbitrary FEN. */
  loadFen(fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
    // Reset the game state
    game.load(fen);
    // Clear all marks
    clearAllMarks();
    // Render the position
    renderPosition(game.fen());
    // Update check highlight
    updateCheckHighlight();
    // Reset history
    resetHistory();
  }

  /**
   * Register a callback fired after every completed move.
   *
   * @param {(payload: { move: object, fen: string, turn: "w"|"b" }) => void} fn
   */
  onMove(fn) {
    this._moveListeners.push(fn);
  }

  /**
   * Get the BotController for one side (to manually toggle or configure).
   *
   * @param {"w"|"b"} color
   * @returns {BotController}
   */
  getBotController(color) {
    return this._bots[color];
  }

  /** Flip the board orientation (used by the toolbar flip button + command palette). */
  flipBoard() {
    domBoard.classList.toggle("flipped");
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Load a FEN with fallback to the default starting position.
   * @param {string} fen
   * @param {boolean} resetHistoryFlag
   */
  _loadPosition(fen = START_FEN, resetHistoryFlag = false) {
    try {
      game.load(fen);
    } catch (e) {
      console.error("Invalid FEN:", fen, e);
      game.reset();
    }

    if (resetHistoryFlag) {
      resetHistory();
    }

    renderPosition(game.fen());
  }

  /**
   * Wraps piece.js executeMove, notifies listeners.
   * The promotion arg is passed through only when the bot supplies one;
   * player-initiated promotions go through the normal askPromotion() flow.
   */
  async _executeMoveAndNotify(from, to, promotion) {
    const move = promotion
      ? await _exec(from, to, promotion)
      : await _exec(from, to);

    if (!move) return null;

    const payload = { move, fen: game.fen(), turn: game.turn() };
    this._moveListeners.forEach((fn) => fn(payload));

    // ── NEW: stop the game cleanly on checkmate / stalemate / draw ──
    if (game.isGameOver()) {
      const uiTitle = document.querySelector(".game-over .title");
      const uiSubTitle = document.querySelector(".game-over .subtitle");
      const whitePlayer = document.querySelector(".game-over .player.white");
      const blackPlayer = document.querySelector(".game-over .player.black");

      // Clear previous winner state
      whitePlayer?.classList.remove("winner");
      blackPlayer?.classList.remove("winner");

      this._bots.w.enabled = false;
      this._bots.b.enabled = false;

      let title = "Game Over";
      let reason = "Game over";

      if (game.isCheckmate()) {
        const winner = move.color === "w" ? "white" : "black";

        title = `${winner} won`;
        reason = `Checkmate — ${winner} wins`;
        if (winner === "white") {
          whitePlayer?.classList.add("winner");
        } else {
          blackPlayer?.classList.add("winner");
        }
      } else if (game.isStalemate()) reason = "Draw — stalemate";
      else if (game.isThreefoldRepetition())
        reason = "Draw — threefold repetition";
      else if (game.isInsufficientMaterial())
        reason = "Draw — insufficient material";
      else if (game.isDraw()) reason = "Draw — 50-move rule";

      uiTitle.textContent = title;
      uiSubTitle.textContent = reason;
      openDialog("dialog-gameover");
    }

    return move;
  }

  /** Trigger bots to check if it's their turn */
  async _triggerBots() {
    if (game.isGameOver()) return;

    // Small delay to ensure the move is fully processed
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Trigger both bots - they'll check if it's their turn
    await this._bots.w.maybeMove();
    await this._bots.b.maybeMove();
  }

  /** Build a UCI move list from chess.js history for the engine payload. */
  _uciMoveList() {
    return game.history({ verbose: true }).map((m) => {
      const promo = m.promotion ? m.promotion : "";
      return m.from + m.to + promo;
    });
  }

  /** Wire toggle buttons and depth selects to their BotControllers. */
  _bindBots() {
    this._bots.w.init("#whiteBot", ".player[data-color='w'] select");
    this._bots.b.init("#blackBot", ".player[data-color='b'] select");
  }

  _bindBoardEvents() {
    // Clicks on blank board area → deselect
    domBoard.addEventListener("click", () => handleBoardClick());

    // Flip button
    document.querySelector("button.flip")?.addEventListener("click", () => {
      this.flipBoard();
    });
  }

  _bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") goBack();
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goForward();
      if (e.key === "ArrowUp") goFirst();
      if (e.key === "ArrowDown") goLast();
    });
  }
}
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
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadPGN);
  }

  // FEN/PGN input sync
  if (fenInput) {
    fenInput.addEventListener("input", () => {
      const hasPgnValue = pgnInput.value.trim(); 
      const hasFenValue = fenInput.value.trim(); 
      
      loadGameBtn.disabled = !hasFenValue && !hasPgnValue;

      if (hasFenValue) {
        pgnInput.value = "";
      }
    });
  }

  if (pgnInput) {
    pgnInput.addEventListener("input", () => {
      const hasPgnValue = pgnInput.value.trim(); 
      const hasFenValue = fenInput.value.trim(); 

      loadGameBtn.disabled = !hasFenValue && !hasPgnValue;

      if (hasPgnValue) {
        fenInput.value = "";
      }
    });
  }

  // File upload
  if (uploadBtn) {
    uploadBtn.addEventListener("click", () => {
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        handleFileUpload(file);
      }
      fileInput.value = "";
    });
  }

  // Load Game buttons
  if (loadGameBtn) {
    loadGameBtn.addEventListener("click", loadFromInput);
  }

  if (newGameBtn) {
    newGameBtn.addEventListener("click", () => {
      const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      loadFEN(START_FEN);
    });
  }

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
}

// ─── Public API ──────────────────────────────────────────────────────────

export default {
  openDialog,
  closeDialogs,
  downloadPGN,
  loadFEN,
  loadPGN,
  initDialogs,
};
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
// fen.js
export function parseFen(fen) {
  const [position] = fen.split(" ");

  const board = {};

  const map = {
    P: "wp",
    R: "wr",
    N: "wn",
    B: "wb",
    Q: "wq",
    K: "wk",

    p: "bp",
    r: "br",
    n: "bn",
    b: "bb",
    q: "bq",
    k: "bk",
  };

  const rows = position.split("/");

  for (let rank = 8; rank >= 1; rank--) {
    let file = 0;

    for (const char of rows[8 - rank]) {
      if (char >= "1" && char <= "8") {
        file += Number(char);
      } else {
        const square = String.fromCharCode(97 + file) + rank;

        board[square] = map[char];

        file++;
      }
    }
  }

  return board;
}
// game.js
// Single source of truth. Import `game` everywhere instead of
// constructing Chess() in multiple places.

import { Chess } from "../vendor/chess.esm.js"; // vendored locally — no network access inside the webview

export const game = new Chess();

/** Returns 'w' | 'b' */
export const currentSide = () => game.turn();

/**
 * Attempt a move. Returns the move object on success, null on failure.
 * Accepts { from, to, promotion? } or a SAN string.
 */
export const tryMove = (moveInput) => {
  try {
    return game.move(moveInput);
  } catch {
    return null;
  }
};

/** Legal destination squares for a piece on `square`. */
export const legalTargets = (square) =>
  game.moves({ square, verbose: true }).map((m) => m.to);

/** True if the piece on `square` belongs to the side to move. */
export const isOwnPiece = (square) => {
  const piece = game.get(square);
  return piece && piece.color === game.turn();
};
// history.js
import { game } from "./game.js";
import {
  movePiece,
  addPiece,
  removePiece,
  updateCheckHighlight,
} from "./piece.js";
import { setLastMoveMark, clearMarks, clearAllMarks } from "./marks.js";
import { renderPosition } from "./board.js";

export const moveHistory = [];
let currentIndex = -1; // -1 = start position
let onMoveCallback = null; // Callback for when a move is recorded

const getMoveList = () => document.querySelector(".history-moves");

// ─── Set callback for move recording ────────────────────────────────────────
export const setOnMoveCallback = (callback) => {
  onMoveCallback = callback;
};

// ─── Are we at the latest move? ────────────────────────────────────────────
export const isLive = () => {
  return currentIndex === moveHistory.length - 1;
};

// ─── Get current index ─────────────────────────────────────────────────────
export const getCurrentIndex = () => currentIndex;

// ─── Get move history length ──────────────────────────────────────────────
export const getHistoryLength = () => moveHistory.length;

// ─── Called from executeMove after a real move is played ──────────────────
export const recordMove = (move) => {
  // If we're not at the end, truncate the history (branching)
  if (currentIndex < moveHistory.length - 1) {
    moveHistory.splice(currentIndex + 1);
  }

  moveHistory.push({ move, fen: game.fen() });
  currentIndex = moveHistory.length - 1;

  renderHistory();
  scrollToActive();

  // Call the callback if set
  if (onMoveCallback) {
    onMoveCallback(move);
  }
};

// ─── Step one move forward (apply GUI) ────────────────────────────────────
const stepForward = () => {
  if (currentIndex >= moveHistory.length - 1) return;
  currentIndex++;
  clearAllMarks();
  applyMoveGui(moveHistory[currentIndex].move);
  updateCheckHighlight();
  updateActiveHighlight();
};

// ─── Step one move backward (reverse GUI) ──────────────────────────────────
const stepBack = () => {
  if (currentIndex < 0) return;
  reverseMoveGui(moveHistory[currentIndex].move);
  currentIndex--;

  clearAllMarks();

  const prev = moveHistory[currentIndex].move;
  setLastMoveMark(prev.from, prev.to);

  updateCheckHighlight();
  updateActiveHighlight();
};

// ─── Apply a move forward on the GUI ──────────────────────────────────────
const applyMoveGui = (move) => {
  // Load the FEN from history to set game state
  if (currentIndex >= 0 && currentIndex < moveHistory.length) {
    const entry = moveHistory[currentIndex];
    if (entry && entry.fen) {
      try {
        game.load(entry.fen);
      } catch (e) {
        console.warn("Failed to load FEN for move:", entry.fen, e);
      }
    }
  }

  // Apply GUI changes
  if (move.flags.includes("e")) {
    removePiece(move.to[0] + move.from[1]);
  }
  if (move.flags.includes("k") || move.flags.includes("q")) {
    const rank = move.from[1];
    const ks = move.flags.includes("k");
    movePiece((ks ? "h" : "a") + rank, (ks ? "f" : "d") + rank);
  }
  if (move.flags.includes("c")) {
    removePiece(move.to);
  }
  movePiece(move.from, move.to);
  if (move.flags.includes("p")) {
    removePiece(move.to);
    addPiece(move.to, move.color + move.promotion);
  }
  setLastMoveMark(move.from, move.to);
};

// ─── Reverse a move on the GUI ──────────────────────────────────────────────
const reverseMoveGui = (move) => {
  // Load the previous FEN to set game state
  if (currentIndex - 1 >= 0) {
    const entry = moveHistory[currentIndex - 1];
    if (entry && entry.fen) {
      try {
        game.load(entry.fen);
      } catch (e) {
        console.warn("Failed to load FEN for previous position:", entry.fen, e);
      }
    }
  } else {
    // Reset to initial position
    game.reset();
  }

  // Apply GUI changes
  if (move.flags.includes("p")) {
    removePiece(move.to);
    addPiece(move.from, move.color + "p");
  } else {
    movePiece(move.to, move.from);
  }
  if (move.flags.includes("k") || move.flags.includes("q")) {
    const rank = move.from[1];
    const ks = move.flags.includes("k");
    movePiece((ks ? "f" : "d") + rank, (ks ? "h" : "a") + rank);
  }
  if (move.flags.includes("c")) {
    addPiece(move.to, (move.color === "w" ? "b" : "w") + move.captured);
  }
  if (move.flags.includes("e")) {
    addPiece(move.to[0] + move.from[1], move.color === "w" ? "bp" : "wp");
  }
};

// ─── Public navigation ──────────────────────────────────────────────────────
export const goForward = () => stepForward();
export const goBack = () => stepBack();
export const goFirst = () => {
  while (currentIndex >= 0) stepBack();
};
export const goLast = () => {
  while (currentIndex < moveHistory.length - 1) stepForward();
};

export const goTo = (index) => {
  if (index === currentIndex) return;
  if (index > currentIndex) {
    while (currentIndex < index) stepForward();
  } else {
    while (currentIndex > index) stepBack();
  }
};

// ─── Render move list ──────────────────────────────────────────────────────
export const renderHistory = () => {
  const moveList = getMoveList();
  if (!moveList) return;
  moveList.innerHTML = "";

  const rows = [];
  moveHistory.forEach((entry, idx) => {
    const { move } = entry;
    const moveNumber = Math.ceil((idx + 1) / 2);
    const rowIdx = moveNumber - 1;
    if (!rows[rowIdx]) rows[rowIdx] = { number: moveNumber };
    rows[rowIdx][move.color === "w" ? "white" : "black"] = {
      san: move.san,
      idx,
    };
  });
  rows.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.classList.add("history-row");

    const numEl = document.createElement("span");
    numEl.classList.add("move-num");
    numEl.textContent = row.number + ".";
    rowEl.append(numEl);

    for (const side of ["white", "black"]) {
      const entry = row[side];
      if (!entry) {
        const ph = document.createElement("span");
        ph.classList.add("move-btn", "placeholder");
        rowEl.append(ph);
        continue;
      }
      const btn = document.createElement("button");
      btn.classList.add("move-btn");
      btn.dataset.idx = entry.idx;
      btn.textContent = entry.san;
      if (entry.idx === currentIndex) btn.classList.add("active");
      btn.addEventListener("click", () => goTo(entry.idx));
      rowEl.append(btn);
    }

    moveList.append(rowEl);
    const activeBtn = moveList.querySelector(".move-btn.active");

    activeBtn?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  });
};

// ─── Lightweight active-move highlight (no DOM rebuild) ───────────────────
const updateActiveHighlight = () => {
  const moveList = getMoveList();
  if (!moveList) return;

  moveList.querySelector(".move-btn.active")?.classList.remove("active");

  if (currentIndex >= 0) {
    moveList
      .querySelector(`.move-btn[data-idx="${currentIndex}"]`)
      ?.classList.add("active");
  }

  scrollToActive();
};

const scrollToActive = () => {
  getMoveList()
    ?.querySelector(".move-btn.active")
    ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
};

// ─── Hold-to-repeat nav buttons ──────────────────────────────────────────────
let repeatTimer = null;
let repeatInterval = null;

const startRepeat = (fn) => {
  fn();
  repeatTimer = setTimeout(() => {
    repeatInterval = setInterval(fn, 120);
  }, 400);
};

const stopRepeat = () => {
  clearTimeout(repeatTimer);
  clearInterval(repeatInterval);
  repeatTimer = repeatInterval = null;
};

const bindNavBtn = (selector, fn) => {
  const btn = document.querySelector(selector);
  if (!btn) return;
  btn.addEventListener("mousedown", () => startRepeat(fn));
  btn.addEventListener("touchstart", () => startRepeat(fn), { passive: true });
  btn.addEventListener("mouseup", stopRepeat);
  btn.addEventListener("mouseleave", stopRepeat);
  btn.addEventListener("touchend", stopRepeat);
  btn.addEventListener("touchcancel", stopRepeat);
};

export const initHistory = () => {
  bindNavBtn(".nav-first", goFirst);
  bindNavBtn(".nav-prev", goBack);
  bindNavBtn(".nav-next", goForward);
  bindNavBtn(".nav-last", goLast);
};

export const resetHistory = () => {
  moveHistory.length = 0;
  currentIndex = -1;
  renderHistory();
  // Clear check highlights on reset
  document
    .querySelectorAll(".square.in-check")
    .forEach((el) => el.classList.remove("in-check"));
};

// ─── Build history from moves (for PGN loading) ──────────────────────────

export const buildHistoryFromMoves = (moves) => {
  // Clear existing history
  moveHistory.length = 0;
  currentIndex = -1;

  // Reset game to start
  game.reset();

  // Clear the board and render initial position
  renderPosition(game.fen());
  clearAllMarks();
  updateCheckHighlight();

  // Play through each move and record it
  moves.forEach((move) => {
    const result = game.move(move);
    if (result) {
      moveHistory.push({ move: result, fen: game.fen() });
      currentIndex = moveHistory.length - 1;

      // Apply the move to the GUI
      applyMoveGui(result);
    }
  });

  // Render the history
  renderHistory();

  // Update check highlight
  updateCheckHighlight();

  // Navigate to the end
  goLast();
};
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
// marks.js
// Renders / clears all visual marks on .mark-layer:
//   • selected-square highlight
//   • last-move highlight (from + to)
//   • legal-move hint dots / capture rings

import { markLayer } from "./board.js";
import { legalTargets } from "./game.js";
import { guiPieces } from "./piece.js";

// ─── Internal state ───────────────────────────────────────────────────────────
let hintMarks      = [];    // [{ square, domMark }]  — legal-move dots
let selectedMark   = null;  // single highlight div for selected square
let lastMoveMarks  = [];    // [div, div] — from / to highlight divs

// ─── Helpers ──────────────────────────────────────────────────────────────────
const makeMark = (square, ...classes) => {
  const el = document.createElement("div");
  el.classList.add("mark", ...classes);
  el.dataset.square = square;
  markLayer.append(el);
  return el;
};

// ─── Selected-square highlight ────────────────────────────────────────────────
export const setSelectedMark = (square) => {
  selectedMark?.remove();
  selectedMark = null;
  if (square) {
    selectedMark = makeMark(square, "selected-highlight");
  }
};

// ─── Last-move highlight ──────────────────────────────────────────────────────
export const setLastMoveMark = (from, to) => {
  lastMoveMarks.forEach((el) => el.remove());
  lastMoveMarks = [];
  if (from && to) {
    lastMoveMarks = [
      makeMark(from, "last-move-highlight"),
      makeMark(to,   "last-move-highlight"),
    ];
  }
};

// ─── Legal-move hints ─────────────────────────────────────────────────────────
export const clearHints = () => {
  hintMarks.forEach(({ domMark }) => domMark.remove());
  hintMarks = [];
};

export const showHints = (fromSquare, onMarkClick) => {
  clearHints();

  const targets = legalTargets(fromSquare);

  targets.forEach((toSquare) => {
    const classes = guiPieces[toSquare] ? ["hint", "capture"] : ["hint"];
    const domMark = makeMark(toSquare, ...classes);

    domMark.addEventListener("click", (e) => {
      e.stopPropagation();
      onMarkClick(fromSquare, toSquare);
    });

    hintMarks.push({ square: toSquare, domMark });
  });

  return targets;
};

// ─── Clear everything ─────────────────────────────────────────────────────────
/** Clears hints + selected highlight (call on deselect / move complete). */
export const clearMarks = () => {
  clearHints();
  setSelectedMark(null);
};

/** Full reset — also wipes last-move highlight (call on board reset). */
export const clearAllMarks = () => {
  clearMarks();
  setLastMoveMark(null, null);
};
// piece.js
import { pieceLayer, squareLayer } from "./board.js";
import { tryMove, isOwnPiece, game } from "./game.js";
import { showHints, clearMarks, setSelectedMark, setLastMoveMark } from "./marks.js";
import { askPromotion } from "./promotion.js";
import { playMoveSound, playIllegal } from "./sound.js";
import { recordMove, isLive } from "./history.js";

export let guiPieces = {};

// ─── Selection state ──────────────────────────────────────────────────────────
let selectedSquare = null;

const setSelected = (square) => {
  selectedSquare = square;
  setSelectedMark(square);
};

// ─── Check highlight ──────────────────────────────────────────────────────────
export const updateCheckHighlight = () => {
  squareLayer
    .querySelectorAll(".square.in-check")
    .forEach((sq) => sq.classList.remove("in-check"));

  if (!game.inCheck()) return;

  const kingColor = game.turn();
  for (const row of game.board()) {
    for (const cell of row) {
      if (cell?.type === "k" && cell.color === kingColor) {
        squareLayer
          .querySelector(`[data-square="${cell.square}"]`)
          ?.classList.add("in-check");
        return;
      }
    }
  }
};

// ─── Piece primitives ─────────────────────────────────────────────────────────
export const addPiece = (square, piece) => {
  const domPiece = document.createElement("div");
  guiPieces[square] = domPiece;

  domPiece.classList.add("piece", piece);
  domPiece.dataset.square = square;
  domPiece.draggable = true;

  domPiece.addEventListener("dragstart", handleDragStart);
  domPiece.addEventListener("click", handlePieceClick);

  pieceLayer.append(domPiece);
};

export const removePiece = (square) => {
  guiPieces[square]?.remove();
  delete guiPieces[square];
};

export const movePiece = (from, to) => {
  if (!guiPieces[from]) return;
  if (guiPieces[to]) removePiece(to);
  guiPieces[from].dataset.square = to;
  guiPieces[to] = guiPieces[from];
  delete guiPieces[from];
};

// ─── Special move GUI effects ─────────────────────────────────────────────────
const handleEnPassant = (move) => {
  removePiece(move.to[0] + move.from[1]);
};

const handleCastling = (move) => {
  const rank = move.from[1];
  const ks = move.flags.includes("k");
  movePiece((ks ? "h" : "a") + rank, (ks ? "f" : "d") + rank);
};

const applyPromotion = (move) => {
  const domPiece = guiPieces[move.to];
  if (!domPiece) return;
  domPiece.classList.remove(move.color + "p");
  domPiece.classList.add(move.color + move.promotion);
};

const isPromotionMove = (from, to) => {
  const piece = game.get(from);
  if (!piece || piece.type !== "p") return false;
  const toRank = parseInt(to[1]);
  return (piece.color === "w" && toRank === 8) ||
         (piece.color === "b" && toRank === 1);
};

// ─── Core move executor ───────────────────────────────────────────────────────
export const executeMove = async (from, to, promotion) => {
  // Allow moves when at historical position (branching) — recordMove
  // handles truncation of any redundant future history.

  // Resolve promotion piece
  let promo = promotion ?? "q";
  if (!promotion && isPromotionMove(from, to)) {
    promo = await askPromotion(to, game.turn());
  }

  const move = tryMove({ from, to, promotion: promo });

  if (!move) {
    playIllegal();
    clearMarks();
    setSelected(null);
    return null;
  }

  movePiece(from, to);

  if (move.flags.includes("e")) handleEnPassant(move);
  if (move.flags.includes("k") || move.flags.includes("q")) handleCastling(move);
  if (move.flags.includes("p")) applyPromotion(move);

  clearMarks();
  setSelected(null);
  setLastMoveMark(from, to);
  updateCheckHighlight();
  playMoveSound(move, game, move.color);

  recordMove(move);

  return move;
};

// ─── Click handler ────────────────────────────────────────────────────────────
export const handlePieceClick = (e) => {
  e.stopPropagation();

  const square = e.currentTarget.dataset.square;

  if (square === selectedSquare) {
    clearMarks();
    setSelected(null);
    return;
  }

  if (isOwnPiece(square)) {
    setSelected(square);
    showHints(square, executeMove);
    return;
  }

  if (selectedSquare) {
    executeMove(selectedSquare, square);
    return;
  }
};

// ─── Click on board background → deselect ────────────────────────────────────
export const handleBoardClick = () => {
  clearMarks();
  setSelected(null);
};

// ─── Drag & Drop ─────────────────────────────────────────────────────────────
let dragSource = null;
let dragEl = null;

const allowDrop = (e) => e.preventDefault();

const resolveDropSquare = (e) => {
  const el = e.target.closest("[data-square]") ?? e.target;
  return el.dataset.square ?? null;
};

const cleanupDrag = () => {
  dragEl?.classList.remove("dragging");
  dragEl = null;
  dragSource = null;
  document.removeEventListener("dragover", allowDrop);
  document.removeEventListener("drop", handleDrop);
};

const handleDrop = (e) => {
  e.preventDefault();
  e.stopPropagation();
  const toSquare = resolveDropSquare(e);
  if (dragSource && toSquare && toSquare !== dragSource) {
    dragEl?.classList.remove("dragging");
    executeMove(dragSource, toSquare);
  }
  cleanupDrag();
};

export const handleDragStart = (e) => {
  const square = e.currentTarget.dataset.square;

  if (!isOwnPiece(square)) {
    e.preventDefault();
    return;
  }

  dragSource = square;
  dragEl = guiPieces[square];

  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", square);

  setTimeout(() => dragEl?.classList.add("dragging"), 0);

  setSelected(square);
  showHints(square, executeMove);

  document.addEventListener("dragover", allowDrop);
  document.addEventListener("drop", handleDrop);
};

document.addEventListener("dragend", cleanupDrag);

export const initPieceLayer = () => {};
// promotion.js
// Shows the promotion picker and resolves a Promise with the chosen piece.
// Caller: executeMove() in piece.js

const whiteWindow = document.querySelector(".promotion-window.white");
const blackWindow = document.querySelector(".promotion-window.black");

/**
 * Returns a Promise<'q'|'r'|'b'|'n'> that resolves when the user picks.
 * @param {string} toSquare  - e.g. "e8" or "d1"
 * @param {string} color     - 'w' | 'b'
 */
export const askPromotion = (toSquare, color) => {
  return new Promise((resolve) => {
    const file = toSquare[0];               // 'a'..'h'
    const window_ = color === "w" ? whiteWindow : blackWindow;

    // Position the window over the correct file
    window_.dataset.file = file;
    window_.style.display = "flex";

    // Map piece class → letter
    const pieceMap = { wq: "q", wr: "r", wb: "b", wn: "n",
                       bq: "q", br: "r", bb: "b", bn: "n" };

    const pieces = window_.querySelectorAll(".piece");

    const cleanup = () => {
      window_.style.display = "none";
      pieces.forEach((p) => p.removeEventListener("click", onPick));
    };

    const onPick = (e) => {
      const cls = [...e.currentTarget.classList].find((c) => pieceMap[c]);
      cleanup();
      resolve(pieceMap[cls] ?? "q");
    };

    pieces.forEach((p) => p.addEventListener("click", onPick, { once: true }));
  });
};
// sound.js
// Play sounds based on move flags and game state.
// chess.js move.flags: 'n'=normal, 'b'=pawn double, 'e'=en passant,
//                      'c'=capture, 'k'=kingside castle, 'q'=queenside castle,
//                      'p'=promotion

const cache = {};

const load = (name) => {
  if (!cache[name]) {
    // NOTE: relative path (no leading "/") so it resolves against the
    // <base href="__BASE_URI__/"> tag injected by extension.js.
    const audio = new Audio(`assets/sounds/${name}.mp3`);
    audio.preload = "auto";
    cache[name] = audio;
  }
  return cache[name];
};

export const play = (name) => {
  const audio = load(name);
  audio.currentTime = 0;
  audio.play().catch(() => {}); // ignore autoplay policy errors
};

// Preload all sounds up front
const ALL = [
  "capture","castle","game-end","game-start",
  "illegal","move-check","move-opponent","move-self",
  "notify","premove","promote","tenseconds",
];
ALL.forEach(load);

/**
 * Pick and play the right sound for a completed move.
 * @param {object} move  - chess.js move object
 * @param {object} game  - Chess instance (to check isCheck, isGameOver)
 * @param {string} side  - 'w' | 'b'  (side that just moved)
 */
export const playMoveSound = (move, game, side) => {
  if (game.isGameOver()) {
    play("game-end");
    return;
  }
  if (move.flags.includes("p")) {
    play("promote");
    return;
  }
  if (move.flags.includes("k") || move.flags.includes("q")) {
    play("castle");
    return;
  }
  if (game.inCheck()) {
    play("move-check");
    return;
  }
  if (move.flags.includes("c") || move.flags.includes("e")) {
    play("capture");
    return;
  }
  play("move-self");
};

export const playIllegal  = () => play("illegal");
export const playGameStart = () => play("game-start");
/**
 * ui.js
 * Manages player-panel UI state (thinking indicator, depth badge).
 *
 * DOM contract:
 *   .player[data-color="w"]   — white player panel
 *   .player[data-color="b"]   — black player panel
 *   .player.thinking          — CSS class shown while engine is computing
 *   .loader                   — element inside the panel (shown via .thinking)
 *   sup#searchDepth            — inside each panel, shows current depth
 */

/**
 * Toggle the thinking state for one side.
 *
 * @param {"w"|"b"} color
 * @param {boolean}  on
 */
export function setThinking(color, on) {
  const panel = document.querySelector(`.player[data-color="${color}"]`);
  if (!panel) return;
  panel.classList.toggle("thinking", on);
}

/**
 * Update the depth badge inside a player panel.
 *
 * @param {"w"|"b"} color
 * @param {number|string} depth
 */
export function setDepthBadge(color, depth) {
  const panel = document.querySelector(`.player[data-color="${color}"]`);
  if (!panel) return;
  const badge = panel.querySelector("sup");
  if (badge) badge.textContent = depth != null ? `d${depth}` : "";
}

/**
 * Update the time taken for a move.
 *
 * @param {"w"|"b"} color
 * @param {number} timeMs - Time in milliseconds
 */
export function setMoveTime(color, timeMs, nodes) {
  const panel = document.querySelector(`.player[data-color="${color}"]`);
  if (!panel) return;
  const timeSpan = panel.querySelector(".time span");
  const nodeSpan = panel.querySelector(".nodes span");

  if (timeSpan) {
    const seconds = (timeMs / 1000).toFixed(2);
    timeSpan.textContent = `${seconds}s`;
  }

  if (nodeSpan) {
    nodeSpan.textContent = formatNumber(nodes);
  }
}

function formatNumber(num, fixed = 2) {
  if (num == null) return "";

  const absNum = Math.abs(num);

  if (absNum >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(fixed) + "b";
  }
  if (absNum >= 1_000_000) {
    return (num / 1_000_000).toFixed(fixed) + "m";
  }
  if (absNum >= 1_000) {
    return (num / 1_000).toFixed(fixed) + "k";
  }
  return num.toString();
}
