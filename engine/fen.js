/**
 * fen.js
 * ────────────────────────────────────────────────────────────────────────
 * Small chess.js-backed helper for turning a { fen, moves } payload (the
 * shape UCIEngine.getBestMove / requestMove already consume) into the FEN
 * of the actual current position. Needed because BookPool.probe() looks
 * up a book by position, not by move history — the engine itself never
 * needs this since it accepts "position fen ... moves ..." directly.
 */

import { Chess } from "../media/vendor/chess.esm.js";

/**
 * @param {string} fen - starting FEN, or "startpos"/falsy
 * @param {string[]} [moves] - UCI move strings played from that FEN
 * @returns {string} FEN of the resulting position
 */
export function currentFenFromPayload(fen, moves = []) {
  const chess = new Chess();
  if (fen && fen !== "startpos") chess.load(fen);

  for (const uci of moves) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length === 5 ? uci[4] : undefined;
    chess.move(promotion ? { from, to, promotion } : { from, to });
  }

  return chess.fen();
}
