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
      game.load(fen);
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
      showGameOverDialog(move);
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
