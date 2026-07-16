chess-vscode/
┣ .vscode/
┃ ┗ launch.json
┣ engine/
┃ ┣ chess.exe
┃ ┣ EnginePool.js
┃ ┣ performance.bin
┃ ┗ UCIEngine.js
┣ media/
┃ ┣ assets/
┃ ┃ ┣ pieces/
┃ ┃ ┃ ┣ bb.webp
┃ ┃ ┃ ┣ bk.webp
┃ ┃ ┃ ┣ bn.webp
┃ ┃ ┃ ┣ bp.webp
┃ ┃ ┃ ┣ bq.webp
┃ ┃ ┃ ┣ br.webp
┃ ┃ ┃ ┣ wb.webp
┃ ┃ ┃ ┣ wk.webp
┃ ┃ ┃ ┣ wn.webp
┃ ┃ ┃ ┣ wp.webp
┃ ┃ ┃ ┣ wq.webp
┃ ┃ ┃ ┗ wr.webp
┃ ┃ ┣ sounds/
┃ ┃ ┃ ┣ capture.mp3
┃ ┃ ┃ ┣ castle.mp3
┃ ┃ ┃ ┣ game-end.mp3
┃ ┃ ┃ ┣ game-start.mp3
┃ ┃ ┃ ┣ illegal.mp3
┃ ┃ ┃ ┣ move-check.mp3
┃ ┃ ┃ ┣ move-opponent.mp3
┃ ┃ ┃ ┣ move-self.mp3
┃ ┃ ┃ ┣ notify.mp3
┃ ┃ ┃ ┣ premove.mp3
┃ ┃ ┃ ┣ promote.mp3
┃ ┃ ┃ ┗ tenseconds.mp3
┃ ┃ ┣ player-black.png
┃ ┃ ┗ player-white.png
┃ ┣ core/
┃ ┃ ┣ board.js
┃ ┃ ┣ bot.js
┃ ┃ ┣ ChessUI.js
┃ ┃ ┣ dialog.js
┃ ┃ ┣ engine.js
┃ ┃ ┣ error.js
┃ ┃ ┣ fen.js
┃ ┃ ┣ game.js
┃ ┃ ┣ gameEndAnimation.js
┃ ┃ ┣ history.js
┃ ┃ ┣ index.js
┃ ┃ ┣ marks.js
┃ ┃ ┣ piece.js
┃ ┃ ┣ promotion.js
┃ ┃ ┣ sound.js
┃ ┃ ┣ ui.js
┃ ┃ ┗ vscodeApi.js
┃ ┣ css/
┃ ┃ ┣ animation.css
┃ ┃ ┣ history.css
┃ ┃ ┣ mark.css
┃ ┃ ┣ position.css
┃ ┃ ┣ promotion-window.css
┃ ┃ ┣ style.css
┃ ┃ ┗ utils.css
┃ ┣ icons/
┃ ┃ ┣ activity-icon.svg
┃ ┃ ┣ icon-128.png
┃ ┃ ┣ icon-256.png
┃ ┃ ┣ icon-512.png
┃ ┃ ┗ icon.svg
┃ ┣ sidebar/
┃ ┃ ┣ sidebar.css
┃ ┃ ┣ sidebar.html
┃ ┃ ┗ sidebar.js
┃ ┣ vendor/
┃ ┃ ┣ chess.esm.js
┃ ┃ ┣ chess.esm.js.map
┃ ┃ ┗ chess.js.LICENSE
┃ ┗ index.html
┣ .gitignore
┣ .vscodeignore
┣ CHANGELOG.md
┣ diff.diff
┣ extension.js
┣ historyStore.js
┣ icon.png
┣ icon.svg
┣ LICENSE
┣ package-lock.json
┣ package.json
┣ README.md
┗ sidebarProvider.js

// board.js
import { parseFen } from "./fen.js";
import { addPiece, clearGuiPieces } from "./piece.js";

export const domBoard = document.querySelector('#board');
export const pieceLayer = domBoard.querySelector('#board .piece-layer')
export const squareLayer = domBoard.querySelector('#board .square-layer')
export const markLayer = domBoard.querySelector('#board .mark-layer')
export const gameEndLayer = domBoard.querySelector('#board .gameend-layer')

export const FILES = 'abcdefgh';

export const initBoard = () => {
    for(let i = 0; i<8; ++i){
        for(let j = 0; j<8; ++j){
            const domSquare = document.createElement('div');
            const color = (i + j ) % 2 === 0? "dark" : "light";

            domSquare.dataset.square = FILES[j] + (i + 1);
            domSquare.classList.add('square', color);

            squareLayer.append(domSquare);
        }
    }
}

export const renderPosition = (fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") => {
    document.querySelectorAll('.piece-layer .piece').forEach(piece=>piece.remove());
    clearGuiPieces();
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

    clearGuiPieces();
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
import { handleError } from "./error.js";
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
      handleError(err, `[Bot ${this.color}] engine error`);
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
import { showGameOverDialog } from "./dialog.js";
import { showGameEndBadges, clearGameEndBadges } from "./gameEndAnimation.js";

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
    resetHistory(game.fen());

    initHistory();
    this._bindBots();
    this._bindBoardEvents();
    this._bindKeyboard();
  }

  /** Full reset: clear history, reload start position. */
  resetGame() {
    clearGameEndBadges();
    this._loadPosition(START_FEN, true);
    notifyNewGame();
  }

  /** Load an arbitrary FEN. */
  loadFen(fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
    clearGameEndBadges();
    // Reset the game state
    // todo game.load(fen);
    // Clear all marks
    clearAllMarks();
    // Render the position
    renderPosition(game.fen());
    // Update check highlight
    updateCheckHighlight();
    // Reset history
    resetHistory(game.fen());
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
      // todo game.load(fen);
    } catch (e) {
      handleError(error, `Invalid FEN: ${fen}`);
      game.reset();
    }

    if (resetHistoryFlag) {
      resetHistory(game.fen());
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
      this._bots.w.enabled = false;
      this._bots.b.enabled = false;
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
};/**
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

import { getVsCodeApi } from "./vscodeApi.js";

// Acquired once per webview session. Calling this twice throws, so guard it.
const vscode = getVsCodeApi();

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
export function handleError(error, message = "Something went wrong") {
  console.error(message, error);

  window.__chanakyaVsCodeApi?.postMessage({
    command: "showError",
    message,
    details:
      error instanceof Error ? (error.stack ?? error.message) : String(error),
  });
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

game.header(
    'Event', 'Chanakya Chess Game',
    'Site', 'VS Code',
    'Date', new Date().toISOString().split('T')[0].replace(/-/g, '.'),
    'Round', '1',
    'White', 'White',
    'Black', 'Black',
    'Result', '*'
);

/** Returns 'w' | 'b' */
export const currentSide = () => game.turn();

/**
 * Attempt a move. Returns the move object on success, null on failure.
 * Accepts { from, to, promotion? } or a SAN string.
 */
export const tryMove = (moveInput) => {
    try {
        // Validate the move input first
        if (!moveInput || typeof moveInput !== 'object') {
            console.warn("Invalid move input:", moveInput);
            return null;
        }
        
        // Check if from and to are valid squares
        if (!moveInput.from || !moveInput.to) {
            console.warn("Move missing from or to:", moveInput);
            return null;
        }
        
        const result = game.move(moveInput);

        // Validate the result
        if (result && result.from && result.to) {
            return result;
        } else {
            console.warn("Move returned invalid result:", result);
            return null;
        }
    } catch (error) {
        console.error("Error making move:", error);
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
import { game } from "./game.js";
import { domBoard, gameEndLayer } from "./board.js";

// Icons lifted from the chess.com inspect-element markup, ids stripped
// (we render up to two "draw" badges at once, duplicate ids are invalid).
const ICONS = {
  draw: `
    <svg xmlns="http://www.w3.org/2000/svg" class="icon slide" width="70%" height="70%" viewBox="0 0 18 19">
      <g>
        <path d="M2.92,7V5.84c.81,0,1.75-.28,1.8-1.22H6.14v5.5H4.34V7Zm8.87-2.39L7,13.88H5l4.8-9.26ZM9.85,13.88c-.08-1.54,1.38-2.19,2.57-2.89.33-.17.78-.4.78-.78a.66.66,0,0,0-.68-.7c-.69,0-.94.58-.92,1.16H10a2.17,2.17,0,0,1,.64-1.79,2.74,2.74,0,0,1,1.91-.62C14.1,8.26,15,8.78,15,10c0,1.82-2.66,2.18-2.66,2.5h2.73v1.38Z"></path>
        <path class="icon-component-shadow" fill="#fff" d="M2.92,6.51V5.34c.81,0,1.75-.28,1.8-1.22H6.14v5.5H4.34V6.51Zm8.87-2.39L7,13.38H5l4.8-9.26ZM9.85,13.38c-.08-1.54,1.38-2.19,2.57-2.89.33-.17.78-.4.78-.78a.66.66,0,0,0-.68-.7c-.69,0-.94.58-.92,1.16H10a2.17,2.17,0,0,1,.64-1.79,2.74,2.74,0,0,1,1.91-.62C14.1,7.76,15,8.28,15,9.5c0,1.82-2.66,2.18-2.66,2.5h2.73v1.38Z"></path>
      </g>
    </svg>`,
  winner: `
    <svg xmlns="http://www.w3.org/2000/svg" class="icon slide" width="70%" height="70%" viewBox="0 0 18 19">
      <g>
        <path d="m 24.4334,39.6517 c 15.9034,0 22.8584,-4.7017 22.8584,-4.7017 l 0.975,-23.6167 c 0,-2.16663 -1.495,-2.79497 -3.25,-1.4083 L 34.1834,17.53 26.6868,2.66667 C 26.0151,0.911667 25.1484,0.5 24.5201,0.5 23.8918,0.5 22.9384,0.955 22.3534,2.66667 L 14.6834,17.53 3.85008,9.925 C 2.09508,8.53833 0.513416,9.16667 0.600083,11.3333 L 1.57508,34.95 c 0,0 6.955,4.55 22.85832,4.7017 z" fill="white" transform="matrix(0.25173118,0,0,0.25173118,2.8497971,2.8741344)"></path>
      </g>
    </svg>`,
  checkmate: `
    <svg xmlns="http://www.w3.org/2000/svg" class="icon slide" width="70%" height="70%" viewBox="0 0 18 19">
      <g>
        <path d="m 9.9742023,6.6728298 2.42e-5,-2.42e-5 -0.00213,-0.00204 C 9.7700909,6.4784115 9.5898002,6.3078138 9.4249699,6.1860933 9.2615451,6.0654149 9.0947034,5.9782259 8.9192108,5.9782259 c -0.25168,0 -0.4344667,0.1056058 -0.549814,0.2695152 -0.1111793,0.1579967 -0.1529321,0.3598302 -0.1529321,0.5495475 0,0.3631985 0.1493457,0.7186669 0.3948949,1.0255973 l 0.036373,0.045485 h 0.058231 1.8222934 0.121163 V 7.7472074 c 0,-0.062738 0.0045,-0.1263489 0.0094,-0.192189 l 6.79e-4,-0.00921 c 0.0046,-0.061284 0.0093,-0.1257673 0.0093,-0.1863246 V 7.30329 l -0.04289,-0.0363 C 10.37581,7.055366 10.165155,6.8638071 9.9742023,6.6728298 Z M 8.7059637,10.223781 h -0.058231 l -0.036373,0.04546 c -0.2455492,0.306954 -0.3948949,0.662399 -0.3948949,1.025621 0,0.189718 0.041753,0.391551 0.1529321,0.549524 0.1153473,0.163909 0.298134,0.269539 0.549814,0.269539 0.1754926,0 0.3423343,-0.08719 0.5057591,-0.207867 0.1648303,-0.121721 0.345121,-0.292319 0.5471241,-0.484677 l 2.43e-5,2.4e-5 0.00208,-0.0021 c 0.1909566,-0.19096 0.4016116,-0.382519 0.6517156,-0.594143 l 0.04289,-0.0363 v -0.0562 c 0,-0.06056 -0.0048,-0.125041 -0.0093,-0.186349 l -6.79e-4,-0.0092 c -0.0049,-0.06584 -0.0094,-0.12945 -0.0094,-0.192188 V 10.223781 H 10.528257 Z M 14.663966,4.902295 h 0.208401 v 0.2084006 9.93e-5 l 0.0065,7.8706591 v 9.7e-5 0.208304 H 14.670436 14.55412 c -0.512351,0 -0.925154,-0.0027 -1.261842,-0.179928 l -0.0024,-0.0013 -0.0024,-0.0011 c -0.294717,-0.138683 -0.506995,-0.38084 -0.634046,-0.780096 l -0.04771,-0.149976 -0.132794,0.0845 c -0.389055,0.247585 -0.730662,0.573344 -1.056979,0.884515 -0.04173,0.03979 -0.08319,0.07931 -0.124459,0.118425 l -2.4e-5,-2.4e-5 -0.0023,0.0023 -0.02246,0.02249 c -0.696009,0.69613 -1.3763643,1.376606 -2.4702007,1.376606 -1.5837231,0 -2.7092072,-1.111695 -2.7092072,-2.631662 0,-0.757682 0.1705492,-1.383417 0.3033682,-1.762875 L 6.435997,10.042013 6.3016271,10.013224 5.7588163,9.8969076 5.6122817,9.8655021 v 0.1498789 0.770597 H 5.4038811 4.2794826 4.0904681 V 9.9378365 9.8166734 H 3.969305 3.3101776 3.1211632 V 9.6082728 8.4838791 8.2754786 H 3.3101776 3.969305 4.0904681 V 8.1543154 7.3061736 H 4.2794826 5.4038811 5.6122817 V 8.076771 8.2255594 L 5.7579924,8.195414 6.3201893,8.0790974 6.4618774,8.0498001 6.4081295,7.9154545 C 6.2579357,7.5399458 6.0872411,6.9154711 6.0872411,6.1575473 c 0,-1.5199695 1.1254841,-2.6316648 2.7092072,-2.6316648 0.9968332,0 1.6502897,0.5651455 2.2851117,1.1922446 h -0.0173 l 0.220735,0.2091227 c 0.04129,0.039104 0.08276,0.078642 0.124459,0.1184175 0.326317,0.3111784 0.667924,0.6369448 1.057003,0.8845295 l 0.13277,0.084499 0.04774,-0.1499757 C 12.773991,5.465466 12.986269,5.2233118 13.280986,5.0846237 l 0.0024,-0.00115 0.0024,-0.00126 C 13.622521,4.9050091 14.035323,4.902295 14.547649,4.902295 Z" fill="white" stroke="white" style="fill:#ffffff;fill-opacity:1;stroke:#ffffff;stroke-width:0.242326;stroke-opacity:1;"></path>
      </g>
    </svg>`,
};

function findKingSquare(color) {
  const board = game.board();
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.type === "k" && cell.color === color) {
        return cell.square;
      }
    }
  }
  return null;
}

function createBadge({ square, colorClass, iconKey, label, squareSizePx }) {
  const el = document.createElement("div");
  el.className = `animated-effect ${colorClass}`;
  el.dataset.square = square;
  el.style.setProperty("--square-size", `${squareSizePx}px`);
  el.style.setProperty("--target-icon-size", "18.75%");

  el.innerHTML = `
    <div class="square ${colorClass}"></div>
    <div>${ICONS[iconKey]}</div>
    <div class="icon-background ${colorClass}"></div>
    <div class="text">${label}</div>
  `;
  return el;
}

/** Remove any badges left over from a previous game. */
export function clearGameEndBadges() {
  gameEndLayer.innerHTML = "";
}

/**
 * Inspect the current game state and render the appropriate
 * winner / checkmate / draw badge(s) on the relevant king square(s).
 * No-op if the game isn't actually over.
 */
export function showGameEndBadges() {
  clearGameEndBadges();
  if (!game.isGameOver()) return;

  const squareSizePx = domBoard.clientWidth / 8;

  if (game.isCheckmate()) {
    // side to move is the one who got mated
    const loserColor = game.turn();
    const winnerColor = loserColor === "w" ? "b" : "w";
    const loserSquare = findKingSquare(loserColor);
    const winnerSquare = findKingSquare(winnerColor);
    const loserClass = loserColor === "w" ? "checkmatewhite" : "checkmateblack";

    if (winnerSquare) {
      gameEndLayer.append(createBadge({
        square: winnerSquare, colorClass: "winner",
        iconKey: "winner", label: "Winner", squareSizePx,
      }));
    }
    if (loserSquare) {
      gameEndLayer.append(createBadge({
        square: loserSquare, colorClass: loserClass,
        iconKey: "checkmate", label: "Checkmate", squareSizePx,
      }));
    }
    return;
  }

  // Everything else that ends the game (stalemate, insufficient material,
  // threefold repetition, 50-move rule, plain draw) gets the two draw badges.
  const whiteKing = findKingSquare("w");
  const blackKing = findKingSquare("b");

  if (whiteKing) {
    gameEndLayer.append(createBadge({
      square: whiteKing, colorClass: "drawwhite",
      iconKey: "draw", label: "Draw", squareSizePx,
    }));
  }
  if (blackKing) {
    gameEndLayer.append(createBadge({
      square: blackKing, colorClass: "drawblack",
      iconKey: "draw", label: "Draw", squareSizePx,
    }));
  }
}

// Keep badge sizing correct if the window/board is resized while a
// game-over badge is still showing.
window.addEventListener("resize", () => {
  if (!gameEndLayer.childElementCount) return;
  const squareSizePx = domBoard.clientWidth / 8;
  gameEndLayer.querySelectorAll("[data-square]").forEach((el) => {
    el.style.setProperty("--square-size", `${squareSizePx}px`);
  });
});// history.js
import { game } from "./game.js";
import {
  movePiece,
  addPiece,
  removePiece,
  updateCheckHighlight,
} from "./piece.js";
import { setLastMoveMark, clearMarks, clearAllMarks } from "./marks.js";
import { showGameEndBadges, clearGameEndBadges } from "./gameEndAnimation.js"; // NEW
import { renderPosition } from "./board.js";
import { playGameEndSound, playMoveSound } from "./sound.js";

export const moveHistory = [];
let currentIndex = -1; // -1 = start position
let onMoveCallback = null; // Callback for when a move is recorded
let startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const getStartFen = () => startFen;
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
  // A new move was played manually/by a bot — auto-play no longer makes sense.
  stopAutoPlay();

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

const syncGameEndBadges = () => {
  // Only show badges if we're at the latest position (end of history)
  if (currentIndex !== moveHistory.length - 1) {
    clearGameEndBadges();
    return;
  }

  if (game.isGameOver()) {
    playGameEndSound();
    showGameEndBadges();
  } else {
    clearGameEndBadges();
  }
};

// ─── Step one move forward (apply GUI) ────────────────────────────────────
const stepForward = () => {
  if (currentIndex >= moveHistory.length - 1) return;

  currentIndex++;

  const move = moveHistory[currentIndex].move;

  clearAllMarks();
  applyMoveGui(move);
  updateCheckHighlight();
  updateActiveHighlight();
  syncGameEndBadges();

  playMoveSound(move, game, move.color);
};

// ─── Step one move backward (reverse GUI) ──────────────────────────────────
const stepBack = () => {
  if (currentIndex < 0) return;

  const move = moveHistory[currentIndex].move;

  reverseMoveGui(move);
  currentIndex--;
  clearAllMarks();
  if (currentIndex >= 0) {
    const prev = moveHistory[currentIndex].move;
    setLastMoveMark(prev.from, prev.to);
  }

  updateCheckHighlight();
  updateActiveHighlight();
  syncGameEndBadges();

  playMoveSound(move, game, move.color);
};

// ─── Apply a move forward on the GUI ──────────────────────────────────────
const applyMoveGui = (move) => {
  // Load the FEN from history to set game state
  if (currentIndex >= 0 && currentIndex < moveHistory.length) {
    const entry = moveHistory[currentIndex];
    if (entry && entry.fen) {
      try {
        // todo game.load(entry.fen);
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
        // todo game.load(entry.fen);
      } catch (e) {
        console.warn("Failed to load FEN for previous position:", entry.fen, e);
      }
    }
  } else {
    // currentIndex - 1 < 0 → stepping back to the very start of the game,
    // which may not be the standard position (e.g. a custom FEN was loaded).
    try {
      // todo game.load(startFen);
    } catch (e) {
      console.warn(
        "Failed to load start FEN, falling back to default:",
        startFen,
        e,
      );
      game.reset();
    }
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

// ─── Auto-play (Play/Pause) ─────────────────────────────────────────────────
let autoPlayTimer = null;
let playBtn = null;
const AUTO_PLAY_SPEED = 800; // ms between moves

export const isAutoPlaying = () => autoPlayTimer !== null;

const setPlayButtonState = (playing) => {
  playBtn?.classList.toggle("playing", playing);
  if (playBtn) playBtn.title = playing ? "Pause" : "Play/Pause";
};

export const stopAutoPlay = () => {
  if (autoPlayTimer) {
    clearInterval(autoPlayTimer);
    autoPlayTimer = null;
  }
  setPlayButtonState(false);
};

const startAutoPlay = () => {
  if (autoPlayTimer || moveHistory.length === 0) return;

  // If we're at (or past) the last move, restart from the beginning.
  if (currentIndex >= moveHistory.length - 1) {
    while (currentIndex >= 0) stepBack();
    clearAllMarks();
    updateCheckHighlight();
    updateActiveHighlight();
  }

  setPlayButtonState(true);
  autoPlayTimer = setInterval(() => {
    if (currentIndex >= moveHistory.length - 1) {
      stopAutoPlay();
      return;
    }
    stepForward();
  }, AUTO_PLAY_SPEED);
};

export const toggleAutoPlay = () => {
  if (isAutoPlaying()) {
    stopAutoPlay();
  } else {
    startAutoPlay();
  }
};

// Wraps a manual nav function so any user-driven navigation interrupts auto-play.
const manual =
  (fn) =>
  (...args) => {
    stopAutoPlay();
    fn(...args);
  };

// ─── Public navigation ──────────────────────────────────────────────────────
export const goForward = manual(() => stepForward());
export const goBack = manual(() => stepBack());
export const goFirst = manual(() => {
  while (currentIndex >= 0) stepBack();
});
export const goLast = manual(() => {
  while (currentIndex < moveHistory.length - 1) stepForward();
});

export const goTo = manual((index) => {
  if (index === currentIndex) return;
  if (index > currentIndex) {
    while (currentIndex < index) stepForward();
  } else {
    while (currentIndex > index) stepBack();
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────
const getStartColor = () => {
  // FEN field 2 (space-separated) is the active color: "w" or "b"
  const parts = startFen.split(" ");
  return parts[1] === "b" ? "b" : "w";
};

// ─── Render move list ──────────────────────────────────────────────────────
export const renderHistory = () => {
  const moveList = getMoveList();
  if (!moveList) return;
  moveList.innerHTML = "";

  const blackStarts = getStartColor() === "b";

  const rows = [];
  moveHistory.forEach((entry, idx) => {
    const { move } = entry;
    const adjustedIdx = blackStarts ? idx + 1 : idx; // shift so pairing matches real move numbers
    const moveNumber = Math.ceil((adjustedIdx + 1) / 2);
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
        // Only happens when the position starts with Black to move —
        // mirrors chess.com's "1. … b5" style.
        if (side === "white" && row.black) {
          ph.textContent = "…";
          ph.classList.add("ellipsis");
        }
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
  const moveList = getMoveList();
  const activeBtn = moveList?.querySelector(".move-btn.active");
  if (!moveList || !activeBtn) return;

  const listRect = moveList.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();

  let deltaY = 0;
  if (btnRect.bottom > listRect.bottom) {
    deltaY = btnRect.bottom - listRect.bottom; // scroll down to reveal bottom
  } else if (btnRect.top < listRect.top) {
    deltaY = btnRect.top - listRect.top; // scroll up to reveal top
  }

  let deltaX = 0;
  if (btnRect.right > listRect.right) {
    deltaX = btnRect.right - listRect.right; // scroll right to reveal right edge
  } else if (btnRect.left < listRect.left) {
    deltaX = btnRect.left - listRect.left; // scroll left to reveal left edge
  }

  if (deltaX || deltaY) {
    moveList.scrollBy({ top: deltaY, left: deltaX, behavior: "smooth" });
  }
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

  playBtn = document.querySelector(".btn.play");
  playBtn?.addEventListener("click", toggleAutoPlay);
};

export const resetHistory = (fen) => {
  stopAutoPlay();
  if (fen) startFen = fen;
  moveHistory.length = 0;
  currentIndex = -1;
  renderHistory();
  document
    .querySelectorAll(".square.in-check")
    .forEach((el) => el.classList.remove("in-check"));
};

// ─── Build history from moves (for PGN loading) ──────────────────────────

export const buildHistoryFromMoves = (moves) => {
  stopAutoPlay();

  // Clear existing history
  moveHistory.length = 0;
  currentIndex = -1;

  // PGN loading is always from the standard start
  startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
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
window.__chanakyaOpenDialog = openDialog;// marks.js
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
import {
  tryMove,
  isOwnPiece,
  game,
} from "./game.js";
import {
  showHints,
  clearMarks,
  setSelectedMark,
  setLastMoveMark,
} from "./marks.js";
import { askPromotion } from "./promotion.js";
import { playMoveSound, playIllegal, playGameEndSound } from "./sound.js";
import { recordMove, isLive } from "./history.js";
import { buildPGNFromHistory, showGameOverDialog } from "./dialog.js";
import { showGameEndBadges } from "./gameEndAnimation.js";
import { getVsCodeApi } from "./vscodeApi.js";

export const guiPieces = {};
export const clearGuiPieces = () => {
  for (const sq in guiPieces) {
    delete guiPieces[sq];
  }
};

// ─── Selection state ──────────────────────────────────────────────────────────
let selectedSquare = null;

const setSelected = (square) => {
  selectedSquare = square;
  setSelectedMark(square);
};

// ─── Check highlight ──────────────────────────────────────────────────────────
export const updateCheckHighlight = (customSquare = null) => {
  squareLayer
    .querySelectorAll(".square.in-check")
    .forEach((sq) => sq.classList.remove("in-check"));

  // If a custom square is provided, use it
  if (customSquare) {
    const squareEl = squareLayer.querySelector(`[data-square="${customSquare}"]`);
    if (squareEl) {
      squareEl.classList.add("in-check");
    }
    return;
  }

  // Otherwise use the game state
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
  return (
    (piece.color === "w" && toRank === 8) ||
    (piece.color === "b" && toRank === 1)
  );
};

// ─── Core move executor ───────────────────────────────────────────────────────
export const executeMove = async (from, to, promotion) => {
  // Allow moves when at historical position (branching) — recordMove
  // handles truncation of any redundant future history.

  // Resolve promotion piece
  let promo = promotion ?? "q";
  let moveInput;

  if (!promotion && isPromotionMove(from, to)) {
    promo = await askPromotion(to, game.turn());
    moveInput = { from, to, promotion: promo };
  } else {
    // Only include promotion if it's actually a promotion move
    moveInput = { from, to };
  }

  const move = tryMove(moveInput);

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

  // Autosave the in-progress game on every move (overwrites one slot —
  // survives reload, no dedup needed since it's never appended).
  getVsCodeApi()?.postMessage({
    command: "saveCurrentGame",
    pgn: buildPGNFromHistory(),
  });

  if (game.isGameOver()) {
    showGameEndBadges();
    showGameOverDialog(move);
    playGameEndSound();

    // Commit the finished game to history. Can't re-enter for the same
    // game: no further move is possible once isGameOver() is true.
    getVsCodeApi()?.postMessage({
      command: "commitGameToHistory",
      pgn: buildPGNFromHistory(),
    });
  }

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
let soundEnabled = true;

export function initSound() {
  const button = document.querySelector("#sound-toggle");

  soundEnabled = JSON.parse(
    localStorage.getItem("chanakya-sound") ?? "true"
  );

  button?.classList.toggle("off", !soundEnabled);

  button?.addEventListener("click", () => {
    soundEnabled = !soundEnabled;

    button.classList.toggle("off", !soundEnabled);

    localStorage.setItem(
      "chanakya-sound",
      JSON.stringify(soundEnabled)
    );
  });
}

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
  if (!soundEnabled) return;


  if (move.flags.includes("p")) {
    play("promote");
    return;
  }
  if (move.flags.includes("k") || move.flags.includes("q")) {
    play("castle");
    return;
  }
  if (move.flags.includes("c") || move.flags.includes("e")) {
    play("capture");
    return;
  }
  play("move-self");
};

export const playIllegal        = () => soundEnabled && play("illegal");
export const playGameStartSound = () => soundEnabled && play("game-start");
export const playGameEndSound   = () => soundEnabled && play("game-end");
export const playCheckSount     = () => soundEnabled && play("move-check");
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
// vscodeApi.js — acquireVsCodeApi() can only be called once per webview.
// Import getVsCodeApi() everywhere instead of calling it directly.
let api = null;

export function getVsCodeApi() {
  if (!api) {
    api = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  }
  return api;
}
/**
 * extension.js
 * ────────────────────────────────────────────────────────────────────────
 * Chanakya (Chess Engine) — VS Code extension entry point.
 *
 * Owns:
 *   - the webview panel lifecycle (chess board UI lives in /media)
 *   - the EnginePool (spawns ./engine/chess.exe, or a user-configured path)
 *   - the postMessage bridge between the webview and the local engine
 *   - the Activity Bar sidebar (New Game / History) and its bridge to the
 *     board panel above
 *
 * No network calls, no HTTP server — the webview talks to this file via
 * vscode.postMessage(), and this file talks to chess.exe over stdin/stdout.
 */

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { EnginePool } = require("./engine/EnginePool");
const { SidebarProvider } = require("./sidebarProvider");
const { HistoryStore } = require("./historyStore");

let pool = null;
let panel = null;
let panelReady = false;
let pendingAction = null; // { command, action, fen?, pgn? } — flushed once panelReady
let sidebarProvider = null;
let historyStore = null;

function activate(context) {
  historyStore = new HistoryStore(context.globalState);

  const openBoard = vscode.commands.registerCommand("chess.openBoard", () => {
    createOrRevealPanel(context);
  });

  context.subscriptions.push(openBoard);

  // ── Sidebar (New Game / History) ─────────────────────────────────────
  sidebarProvider = new SidebarProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      sidebarProvider,
    ),
  );

  // Sidebar → host: forward the chosen action into the board panel,
  // auto-opening it if it isn't already open (and queueing the action
  // until the panel signals it's actually ready to receive messages —
  // see the "ready" case in handleMessage).
  sidebarProvider.onNewGame = () => {
    dispatchToBoard({ command: "uiCommand", action: "newGame" }, context);
    // ui.resetGame() in the webview doesn't currently report back, so we
    // report success optimistically once the message has been dispatched.
    sidebarProvider.postResult("newGame", true);
  };

  sidebarProvider.onLoadFen = (fen) => {
    dispatchToBoard({ command: "uiCommand", action: "loadFen", fen }, context);
  };

  sidebarProvider.onLoadPgn = (pgn) => {
    historyStore.setCurrentGame(pgn);

    sidebarProvider.postHistory(historyStore.getSidebarData());

    dispatchToBoard(
      {
        command: "uiCommand",
        action: "loadPgn",
        pgn,
      },
      context,
    );
  };

  sidebarProvider.onMessage = (msg) => {
    handleMessage(msg, panel, context);
  };
}

/** Send a uiCommand message to the board panel, opening it first if
 *  necessary and queueing the message if the panel hasn't signalled
 *  "ready" yet. Only the most recent pending action is kept — if the
 *  user fires two actions before the panel loads, the second wins. */
function dispatchToBoard(msg, context) {
  if (!panel) {
    createOrRevealPanel(context);
  } else {
    panel.reveal(vscode.ViewColumn.One);
  }

  if (panelReady) {
    panel.webview.postMessage(msg);
  } else {
    pendingAction = msg;
  }
}

function deactivate() {
  pool?.disposeAll();
  pool = null;
}

// ── Panel setup ─────────────────────────────────────────────────────────

function createOrRevealPanel(context) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    return;
  }

  const mediaRoot = vscode.Uri.file(path.join(context.extensionPath, "media"));

  panel = vscode.window.createWebviewPanel(
    "chanakyaBoard",
    "Chess",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [mediaRoot],
    },
  );

  panel.iconPath = vscode.Uri.file(
    path.join(context.extensionPath, "icon.svg"),
  );
  panel.webview.html = getHtml(panel.webview, context.extensionPath);

  panel.webview.onDidReceiveMessage((msg) =>
    handleMessage(msg, panel, context),
  );

  panel.onDidDispose(() => {
    panel = null;
    panelReady = false;
    pendingAction = null;
    pool?.stopAll();
  });
}

// ── HTML ────────────────────────────────────────────────────────────────

function getHtml(webview, extensionPath) {
  const mediaPath = path.join(extensionPath, "media");
  const htmlPath = path.join(mediaPath, "index.html");
  let html = fs.readFileSync(htmlPath, "utf8");

  const baseUri = webview.asWebviewUri(vscode.Uri.file(mediaPath)).toString();
  const nonce = getNonce();

  html = html
    .replace(/__BASE_URI__/g, baseUri)
    .replace(/__CSP_SOURCE__/g, webview.cspSource)
    .replace(/__NONCE__/g, nonce);

  return html;
}

function getNonce() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++)
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

// ── Engine bridge ───────────────────────────────────────────────────────

function resolveEnginePath(extensionPath) {
  const configured = vscode.workspace
    .getConfiguration("chanakya")
    .get("enginePath", "")
    .trim();
  if (configured) return configured;

  const platformExe = process.platform === "win32" ? "chess.exe" : "chess";
  return path.join(extensionPath, "engine", platformExe);
}

function ensurePool(context) {
  if (pool) return pool;

  const enginePath = resolveEnginePath(context.extensionPath);

  if (!fs.existsSync(enginePath)) {
    vscode.window.showErrorMessage(
      `Chanakya: engine executable not found at "${enginePath}". ` +
        `Set "chanakya.enginePath" in Settings, or place your engine at extension/engine/${
          process.platform === "win32" ? "chess.exe" : "chess"
        }.`,
    );
    throw new Error("Engine executable not found: " + enginePath);
  }

  const maxInstances = vscode.workspace
    .getConfiguration("chanakya")
    .get("maxEngineInstances", 2);
  pool = new EnginePool(enginePath, maxInstances);
  return pool;
}

async function handleMessage(msg, panel, context) {
  if (!msg || typeof msg !== "object") return;

  switch (msg.command) {
    case "getMove": {
      const { id, payload, slot } = msg;
      try {
        const enginePool = ensurePool(context);
        const cfg = vscode.workspace.getConfiguration("chanakya");
        const defaults = {
          movetime: payload.movetime ?? cfg.get("defaultMovetimeMs", 1000),
          depth: payload.depth ?? cfg.get("defaultDepth", 0),
        };
        const result = await enginePool.requestMove(slot || "default", {
          ...payload,
          ...defaults,
        });
        panel.webview.postMessage({ command: "bestMove", id, data: result });
      } catch (err) {
        panel.webview.postMessage({
          command: "engineError",
          id,
          error: err.message,
        });
      }
      break;
    }

    // Webview → host: signals index.js has loaded and attached its
    // message listener. Flush anything queued while it was still loading.
    case "ready": {
      panelReady = true;
      if (pendingAction) {
        panel.webview.postMessage(pendingAction);
        pendingAction = null;
      }
      break;
    }

    case "newGame": {
      try {
        const enginePool = ensurePool(context);
        await enginePool.newGame();
      } catch (err) {
        vscode.window.showErrorMessage(`Chanakya: ${err.message}`);
      }
      break;
    }

    case "stopSearch": {
      pool?.stopAll();
      break;
    }

    // Board panel → host: result of an action requested by the sidebar.
    // Relay it back so the sidebar can clear/show the right section's
    // error text.
    case "loadFenResult": {
      sidebarProvider?.postResult("fen", msg.success, msg.error);
      break;
    }

    case "loadPgnResult": {
      sidebarProvider?.postResult("pgn", msg.success, msg.error);
      break;
    }

    case "saveCurrentGame": {
      historyStore.setCurrentGame(msg.pgn);
      sidebarProvider?.postHistory(historyStore.getSidebarData());
      break;
    }

    case "commitGameToHistory": {
      historyStore.commitToHistory(msg.pgn);

      sidebarProvider?.postHistory(historyStore.getSidebarData());

      break;
    }

    case "log": {
      console.log("[Chanakya webview]", msg.data);
      break;
    }

    case "requestHistory": {
      sidebarProvider?.postHistory(historyStore.getSidebarData());
      break;
    }

    case "deleteHistory": {
      historyStore.removeHistory(msg.id);

      sidebarProvider?.postHistory(historyStore.getSidebarData());

      break;
    }

    case "loadHistory": {
      dispatchToBoard(
        {
          command: "uiCommand",
          action: "loadPgn",
          pgn: msg.pgn,
        },
        context,
      );
      break;
    }

    case "confirmClearHistory": {
      const choice = await vscode.window.showWarningMessage(
        "Delete all saved games?",
        { modal: true },
        "Delete"
      );

      if (choice === "Delete") {
        historyStore.clearHistory();

        sidebarProvider?.postHistory(
          historyStore.getSidebarData()
        );
      }

      break;
    }

    default:
      break;
  }
}

module.exports = { activate, deactivate };

// historyStore.js — persistence via context.globalState (VS Code Memento).
// Chosen over a JSON file / SQLite: already-persisted, sync reads, async
// writes, zero extra deps — right fit for a handful of small text blobs.

const CURRENT_KEY = "chanakya.currentGame";
const HISTORY_KEY = "chanakya.history";
const MAX_HISTORY = 50;

function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

class HistoryStore {
  constructor(globalState) {
    this._state = globalState;
    this._hashSet = new Set(this.getHistory().map((g) => g.hash));
  }

  // ── Current (in-progress) game — overwritten every move ──────────────
  setCurrentGame(pgn) {
    this._state.update(CURRENT_KEY, { pgn, updatedAt: Date.now() });
  }

  getCurrentGame() {
    return this._state.get(CURRENT_KEY) || null;
  }

  clearCurrentGame() {
    this._state.update(CURRENT_KEY, undefined);
  }

  // ── Finished/loaded games — append-only, deduped by content hash ─────
  /** Returns { added: boolean, id?: string } */
  commitToHistory(pgn) {
    const hash = fnv1a(pgn);

    this.clearCurrentGame(); // it's no longer "in progress"

    if (this._hashSet.has(hash)) {
      return { added: false, id: hash };
    }

    const entry = { id: hash, pgn, hash, savedAt: Date.now() };
    const history = [entry, ...this.getHistory()].slice(0, MAX_HISTORY);

    this._state.update(HISTORY_KEY, history);
    this._hashSet.add(hash);

    return { added: true, id: hash };
  }

  getHistory() {
    return this._state.get(HISTORY_KEY) || [];
  }

  getSidebarData() {
    return {
      current: this.getCurrentGame(),
      history: this.getHistory(),
    };
  }

  removeHistory(id) {
    const history = this.getHistory().filter(
      (entry) => entry.id !== id
    );

    this._state.update(HISTORY_KEY, history);

    this._hashSet = new Set(
      history.map((g) => g.hash)
    );
  }

  clearHistory() {
    this._state.update(HISTORY_KEY, []);
    this._hashSet.clear();
  }
}

module.exports = { HistoryStore };/**
 * sidebarProvider.js — Activity Bar sidebar webview (New Game / History).
 *
 * This is a *separate* webview from the main chessboard panel. It only
 * knows how to render its tabs and forward a chosen action (fresh board /
 * FEN / PGN) up to whoever owns it (extension.js), via the onNewGame /
 * onLoadFen / onLoadPgn callbacks. It never talks to `game`/`ChessUI`
 * directly.
 */

const vscode = require("vscode");
const fs = require("fs");

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

class SidebarProvider {
  static viewType = "chanakya.sidebarView";

  constructor(extensionUri) {
    this._extensionUri = extensionUri;
    this._view = null;

    // Set these from extension.js:
    this.onNewGame = null; // () => void
    this.onLoadFen = null; // (fen: string) => void
    this.onLoadPgn = null; // (pgn: string) => void
    this.onMessage = null;
  }

  /** @param {vscode.WebviewView} webviewView */
  resolveWebviewView(webviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "media", "sidebar"),
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (!msg) return;

      switch (msg.command) {
        case "newGame":
          if (typeof this.onNewGame === "function") {
            this.onNewGame();
          } else {
            this.postResult("newGame", false, "Not ready yet.");
          }
          break;

        case "loadFen":
          if (typeof this.onLoadFen === "function") {
            this.onLoadFen(msg.fen);
          } else {
            this.postResult("fen", false, "Not ready yet.");
          }
          break;

        case "loadPgn":
          if (typeof this.onLoadPgn === "function") {
            this.onLoadPgn(msg.pgn);
          } else {
            this.postResult("pgn", false, "Not ready yet.");
          }
          break;

        default: this.onMessage?.(msg);
      }
    });
  }

  /** Give the sidebar UI feedback on an action.
   *  kind: "newGame" | "fen" | "pgn" — matches which section's status/error
   *  text should be updated. */
  postResult(kind, success, error) {
    this._view?.webview.postMessage({
      command: "actionResult",
      kind,
      success,
      error,
    });
  }

  postHistory(data) {
    this._view?.webview.postMessage({
      command: "historyData",
      data,
    });
  }

  _getHtml(webview) {
    const nonce = getNonce();

    const htmlPath = vscode.Uri.joinPath(
      this._extensionUri,
      "media",
      "sidebar",
      "sidebar.html",
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "media",
        "sidebar",
        "sidebar.css",
      ),
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "sidebar", "sidebar.js"),
    );

    let html = fs.readFileSync(htmlPath.fsPath, "utf-8");

    html = html
      .replace(/{{cspSource}}/g, webview.cspSource)
      .replace(/{{nonce}}/g, nonce)
      .replace(/{{cssUri}}/g, cssUri.toString())
      .replace(/{{jsUri}}/g, jsUri.toString());

    return html;
  }
}

module.exports = { SidebarProvider };

// sidebar.js — runs inside the sidebar webview (separate context from the
// main chessboard webview). Only responsibility: collect the user's choice
// (fresh board / FEN / PGN) and hand it to the extension host. Actual game
// loading happens in index.js/dialog.js over in the main panel.

const vscode = acquireVsCodeApi();

// ── Tabs ─────────────────────────────────────────────────────────────────
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const historyList = document.getElementById("history-list");

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabBtns.forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    tabContents.forEach((c) => c.classList.remove("active"));

    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add("active");
  });
});

// ── New Game (fresh board) ─────────────────────────────────────────────
const newGameBtn = document.getElementById("sidebar-newgame-btn");
const newGameStatus = document.getElementById("sidebar-newgame-status");

newGameBtn.addEventListener("click", () => {
  newGameStatus.textContent = "";
  vscode.postMessage({ command: "newGame" });
});

// ── FEN ─────────────────────────────────────────────────────────────────
const fenInput = document.getElementById("sidebar-fen-input");
const fenLoadBtn = document.getElementById("sidebar-fen-load-btn");
const fenError = document.getElementById("sidebar-fen-error");

fenInput.addEventListener("input", () => {
  fenLoadBtn.disabled = !fenInput.value.trim();
  fenError.textContent = "";
});

fenInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    submitFen();
  }
});

fenLoadBtn.addEventListener("click", submitFen);

function submitFen() {
  const fen = fenInput.value.trim();
  if (!fen) {
    fenError.textContent = "Please enter a FEN.";
    return;
  }
  fenError.textContent = "";
  fenLoadBtn.disabled = true;
  vscode.postMessage({ command: "loadFen", fen });
}


// ── History actions ───────────────────────────────────────────────

const refreshHistoryBtn = document.getElementById("refresh-history-btn");
const clearHistoryBtn = document.getElementById("clear-history-btn");

refreshHistoryBtn?.addEventListener("click", () => {
  vscode.postMessage({
    command: "requestHistory",
  });
});

clearHistoryBtn?.addEventListener("click", () => {
  vscode.postMessage({
    command: "confirmClearHistory",
  });
});

function renderHistory(data) {
  historyList.innerHTML = "";

  if (!data.current && data.history.length === 0) {
    historyList.innerHTML = `
      <div class="history-empty">
        <div class="history-empty-icon">♟</div>

        <div class="history-empty-title">
          No games saved yet
        </div>

        <div class="history-empty-hint">
          Games are automatically saved when they end
        </div>
      </div>
    `;

    return;
  }


  if (data.current) {
    historyList.appendChild(
      createCard({
        date: "●",
        pgn: data.current.pgn,
        current: true,
      }),
    );
  }

  for (let i = 0; i < data.history.length; ++i) {
    const game = data.history[i];

    try {
      historyList.appendChild(
        createCard({
          date: formatDate(game.savedAt),
          pgn: game.pgn,
          current: false,
          id: game.id,
          index: i + 1,
        }),
      );
    } catch (error) {
      console.log(error);
    }
  }
}

function formatDate(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  const units = [
    { limit: 30, text: "just now" },

    { limit: 60 * 60, size: 60, label: "min" },

    { limit: 60 * 60 * 24, size: 60 * 60, label: "hr" },

    { limit: 60 * 60 * 24 * 7, size: 60 * 60 * 24, label: "day" },

    { limit: 60 * 60 * 24 * 30, size: 60 * 60 * 24 * 7, label: "week" },

    { limit: 60 * 60 * 24 * 365, size: 60 * 60 * 24 * 30, label: "month" },

    { limit: Infinity, size: 60 * 60 * 24 * 365, label: "year" },
  ];

  for (const unit of units) {
    if (seconds < unit.limit) {
      if (unit.text) {
        return unit.text;
      }

      const value = Math.floor(seconds / unit.size);

      return `${value} ${unit.label}${value > 1 ? "s" : ""} ago`;
    }
  }
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function getGameMeta(pgn, current = false) {
  const resultMatch = pgn.match(/\[Result\s+"([^"]+)"\]/);
  const whiteMatch = pgn.match(/\[White\s+"([^"]+)"\]/);
  const blackMatch = pgn.match(/\[Black\s+"([^"]+)"\]/);

  const white = whiteMatch?.[1] || "White";
  const black = blackMatch?.[1] || "Black";

  const result = resultMatch?.[1];

  let winner = "?";
  let crown = false;

  switch (result) {
    case "1-0":
      winner = white;
      crown = true;
      break;

    case "0-1":
      winner = black;
      crown = true;
      break;

    case "1/2-1/2":
      winner = "Draw";
      break;

    default:
      winner = current ? "Recent Game" : "In Progress";
  }

  const movesText = pgn.replace(/\[[^\]]+\]/g, "").replace(/\{[^}]+\}/g, "");

  const totalMoves = (movesText.match(/\d+\./g) || []).length;

  return {
    winner,
    crown,
    totalMoves,
  };
}

function getPgnPreview(pgn) {
  return pgn
    // Remove PGN headers
    .replace(/\[[^\]]+\]\s*\n?/g, "")

    // Collapse multiple blank lines
    .replace(/\n\s*\n/g, "\n")

    // Convert remaining newlines to spaces
    .replace(/\n/g, " ")

    .trim();
}

function createCard({ date, pgn, current, id, index = 0 } = {}) {
  const card = document.createElement("div");

  const meta = getGameMeta(pgn, current);

  card.className = `history-card ${current ? "current" : ""}`;

  card.innerHTML = `
    <div class="history-top">
        <div class="history-card-title">

           <div class="history-index">
            ${current ? "●" : `#${index}`}
           </div>

          <div class="history-winner ${meta.crown ? 'winner' : 'draw'}">
            ${meta.winner}

            ${
              meta.crown
                ? `
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-crown-icon lucide-crown"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>
                `
                : ""
            }
           </div>

        </div>

      <div class="history-date">
        ${date}
      </div>

    </div>

    <div class="history-preview">
        ${escapeHtml(getPgnPreview(pgn))}
    </div>

    <div class="history-bottom">

      <div class="history-moves">
        ${meta.totalMoves} moves
      </div>

      ${
        !current
          ? `
            <button class="delete-btn icon-btn">
              <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M14 2H10C10 0.897 9.103 0 8 0C6.897 0 6 0.897 6 2H2C1.724 2 1.5 2.224 1.5 2.5C1.5 2.776 1.724 3 2 3H2.54L3.349 12.708C3.456 13.994 4.55 15 5.84 15H10.159C11.449 15 12.543 13.993 12.65 12.708L13.459 3H13.999C14.275 3 14.499 2.776 14.499 2.5C14.499 2.224 14.275 2 13.999 2H14ZM8 1C8.551 1 9 1.449 9 2H7C7 1.449 7.449 1 8 1ZM11.655 12.625C11.591 13.396 10.934 14 10.16 14H5.841C5.067 14 4.41 13.396 4.346 12.625L3.544 3H12.458L11.656 12.625H11.655ZM7 5.5V11.5C7 11.776 6.776 12 6.5 12C6.224 12 6 11.776 6 11.5V5.5C6 5.224 6.224 5 6.5 5C6.776 5 7 5.224 7 5.5ZM10 5.5V11.5C10 11.776 9.776 12 9.5 12C9.224 12 9 11.776 9 11.5V5.5C9 5.224 9.224 5 9.5 5C9.776 5 10 5.224 10 5.5Z"/></svg>
            </button>
          `
          : ""
      }

    </div>
  `;

  card.addEventListener("click", () => {
    vscode.postMessage({
      command: "loadHistory",
      pgn,
    });
  });

  const deleteBtn = card.querySelector(".delete-btn");

  deleteBtn?.addEventListener("click", (e) => {
    e.stopPropagation();

    vscode.postMessage({
      command: "deleteHistory",
      id,
    });

    card.style.opacity = "0";
    card.style.transform = "translateY(-8px)";
  });

  return card;
}

// ── PGN ─────────────────────────────────────────────────────────────────
const pgnInput = document.getElementById("sidebar-pgn-input");
const fileInput = document.getElementById("sidebar-file-input");
const uploadBtn = document.getElementById("sidebar-upload-btn");
const pgnLoadBtn = document.getElementById("sidebar-pgn-load-btn");
const pgnError = document.getElementById("sidebar-pgn-error");

pgnInput.addEventListener("input", () => {
  pgnLoadBtn.disabled = !pgnInput.value.trim();
  pgnError.textContent = "";
});

uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  fileInput.value = "";
  if (!file) return;

  if (file.size === 0) {
    pgnError.textContent =
      "Error: File is empty (0 bytes). Please select a valid PGN file.";
    return;
  }

  const reader = new FileReader();

  reader.onload = (ev) => {
    pgnInput.value = ev.target.result;
    pgnLoadBtn.disabled = !pgnInput.value.trim();
    pgnError.textContent = "";
  };

  reader.onerror = () => {
    pgnError.textContent =
      "Error reading file: " + (reader.error?.message || "Unknown error");
  };

  reader.readAsText(file);
});

pgnLoadBtn.addEventListener("click", () => {
  const pgn = pgnInput.value.trim();
  if (!pgn) {
    pgnError.textContent = "Please enter or upload a PGN.";
    return;
  }
  pgnError.textContent = "";
  pgnLoadBtn.disabled = true;
  vscode.postMessage({ command: "loadPgn", pgn });
});

// ── Feedback from extension host ───────────────────────────────────────
window.addEventListener("message", (event) => {
  const msg = event.data;

  if (!msg) return;

  if (msg.command === "historyData") {
    renderHistory(msg.data);
    return;
  }

  if (msg.command !== "actionResult") {
    return;
  }

  if (msg.kind === "newGame") {
    newGameStatus.textContent = msg.success
      ? ""
      : msg.error || "Failed to start new game.";
  } else if (msg.kind === "fen") {
    fenLoadBtn.disabled = !fenInput.value.trim();
    fenError.textContent = msg.success
      ? ""
      : msg.error || "Failed to load FEN.";
  } else if (msg.kind === "pgn") {
    pgnLoadBtn.disabled = !pgnInput.value.trim();
    pgnError.textContent = msg.success
      ? ""
      : msg.error || "Failed to load game.";
  }
});

vscode.postMessage({
  command: "requestHistory",
});
