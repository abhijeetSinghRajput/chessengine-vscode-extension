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
    setDepthBadge({
      color: this.color, 
      depth: "",
      mate: "",
    });
    setMoveTime(this.color, "", "");

    try {
      const { bestMove, depth, time, nodes, mate, source } = await fetchMove(this.slot, {
        fen,
        moves: uciMoves,
        movetime: this._movetime,
      });

      const from = bestMove.slice(0, 2);
      const to = bestMove.slice(2, 4);
      const promotion = bestMove.length === 5 ? bestMove[4] : undefined;

      // Update UI with depth and time
      setDepthBadge({
        color: this.color, 
        depth,
        mate,
      });
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
