/**
 * ChessUI.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Single entry point for the chess UI library. Only real change from your
 * original: _uciMoveList() now reads history.js's `moves` array directly
 * instead of game.history({verbose:true}). Both give the same answer once
 * `game` and `currentIndex` are properly kept in sync (see history.js), but
 * reading `moves` directly is the more robust source of truth — it's
 * correct even if a bot's move request somehow lands while mid-navigation,
 * since it doesn't depend on `game`'s current cursor position at all.
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
  moves,
} from "./history.js";
import { game, resetGame, START_FEN } from "./game.js";
import { BotController } from "./bot.js";
import { clearAllMarks } from "./marks.js";
import { updateCheckHighlight } from "./piece.js";
import { notifyNewGame } from "./engine.js";
import { showGameOverDialog } from "./dialog.js";
import { showGameEndBadges, clearGameEndBadges } from "./gameEndAnimation.js";

export class ChessUI {
  /**
   * @param {Object} options
   * @param {string} [options.endpoint] - unused in the extension build (kept for API compatibility)
   */
  constructor({ endpoint = "" } = {}) {
    this._endpoint = endpoint;
    this._moveListeners = [];

    const getState = () => ({
      fen: game.fen(),
      uciMoves: this._uciMoveList(),
      turn: game.turn(),
    });

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

    setOnMoveCallback(() => {
      this._triggerBots();
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

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
  loadFen(fen = START_FEN) {
    clearGameEndBadges();
    resetGame(fen);
    clearAllMarks();
    renderPosition(game.fen());
    updateCheckHighlight();
    resetHistory(game.fen());
  }

  onMove(fn) {
    this._moveListeners.push(fn);
  }

  getBotController(color) {
    return this._bots[color];
  }

  flipBoard() {
    domBoard.classList.toggle("flipped");
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _loadPosition(fen = START_FEN, resetHistoryFlag = false) {
    try {
      resetGame(fen);
    } catch (e) {
      console.error(`Invalid FEN: ${fen}`, e);
      resetGame(START_FEN);
    }

    if (resetHistoryFlag) {
      resetHistory(game.fen());
    }

    renderPosition(game.fen());
  }

  async _executeMoveAndNotify(from, to, promotion) {
    const move = promotion
      ? await _exec(from, to, promotion)
      : await _exec(from, to);

    if (!move) return null;

    const payload = { move, fen: game.fen(), turn: game.turn() };
    this._moveListeners.forEach((fn) => fn(payload));

    if (game.isGameOver()) {
      this._bots.w.enabled = false;
      this._bots.b.enabled = false;
    }

    return move;
  }

  async _triggerBots() {
    if (game.isGameOver()) return;

    // Small delay to ensure the move is fully processed
    await new Promise((resolve) => setTimeout(resolve, 10));

    await this._bots.w.maybeMove();
    await this._bots.b.maybeMove();
  }

  /** Build a UCI move list for the engine payload — sourced from history.js's
   *  `moves` array, always the live/full game regardless of `game`'s cursor. */
  _uciMoveList() {
    return moves.map((m) => m.from + m.to + (m.promotion || ""));
  }

  _bindBots() {
    this._bots.w.init("#whiteBot", ".player[data-color='w'] select");
    this._bots.b.init("#blackBot", ".player[data-color='b'] select");
  }

  _bindBoardEvents() {
    domBoard.addEventListener("click", () => handleBoardClick());

    document.querySelector("button.flip")?.addEventListener("click", () => {
      this.flipBoard();
    });
  }

  _bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") goBack();
      if (e.key === "ArrowRight") goForward();
      if (e.key === "ArrowUp") goFirst();
      if (e.key === "ArrowDown") goLast();
    });
  }
}