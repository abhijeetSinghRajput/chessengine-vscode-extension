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
