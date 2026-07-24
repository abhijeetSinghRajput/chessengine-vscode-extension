// ChessUI.js
import { coordinates, domBoard, initBoard, renderPosition } from "./board.js";
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
  getCurrentIndex,
} from "./history.js";
import { game, resetGame, START_FEN } from "./game.js";
import { BotController } from "./bot.js";
import { notifyNewGame } from "./engine.js";
import { buildPGNFromHistory } from "./dialog.js";

export class ChessUI {
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

    setOnMoveCallback(() => this._triggerBots());
  }

  init() {
    initBoard();
    initPieceLayer();
    this._loadPosition(START_FEN, true);
    initHistory();
    this._bindBots();
    this._bindBoardEvents();
    this._bindKeyboard();
  }

  // Single reset function - delegates to game.js
  resetGame() {
    clearGameEndBadges();
    this._loadPosition(START_FEN, true);
    notifyNewGame();
  }

  loadFen(fen = START_FEN) {
    resetGame(fen);
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
    this._flipCoordinates();
  }

  // Private methods
  _flipCoordinates() {
    let texts = domBoard.classList.contains("flipped")
      ? "12345678hgfedcba"
      : "87654321abcdefgh";
    for (let i = 0; i < coordinates.length; i++) {
      coordinates[i].textContent = texts[i];
    }
  }

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
    await new Promise((resolve) => setTimeout(resolve, 10));
    await this._bots.w.maybeMove();
    await this._bots.b.maybeMove();
  }

  _uciMoveList() {
    const current = getCurrentIndex();
    return moves
      .slice(0, current + 1)
      .map((m) => m.from + m.to + (m.promotion || ""));
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
