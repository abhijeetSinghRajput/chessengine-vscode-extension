// game.js
// ────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for game state (Chess.com / Lichess pattern).
//
// There is exactly ONE Chess.js instance in the whole app: `game`.
//   - Live play mutates it via makeMove().
//   - History navigation mutates it via makeMove()/undoMove() for single
//     steps, or resetGame() + replay for multi-step jumps — see history.js.
//   - PGN export uses a throw-away *scratch* Chess instance (see dialog.js)
//     so exporting never has to touch — or risk corrupting — this one.
//
// Nothing outside this file is allowed to call game.load()/game.reset()
// directly. Always go through the exported helpers so state + headers stay
// consistent everywhere (dialog.js, history.js, piece.js, ChessUI.js).
// ────────────────────────────────────────────────────────────────────────

import { Chess } from "../vendor/chess.esm.js";

export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const game = new Chess();

const DEFAULT_HEADERS = () => ({
  Event: "Chanakya Chess Game",
  Site: "VS Code",
  Date: new Date().toISOString().split("T")[0].replace(/-/g, "."),
  Round: "1",
  White: "White",
  Black: "Black",
  Result: "*",
});

let headers = DEFAULT_HEADERS();

const applyHeaders = () => {
  Object.entries(headers).forEach(([k, v]) => {
    if (v != null) game.header(k, v);
  });
};

applyHeaders();

/** Read current PGN headers (Event/Site/Date/Round/White/Black/Result). */
export const getHeaders = () => ({ ...headers });

/** Merge-update headers (e.g. { Result: "1-0" }) and keep `game` in sync. */
export const setHeaders = (partial) => {
  headers = { ...headers, ...partial };
  applyHeaders();
};

/** Reset headers to their defaults (fresh Date, "*" result, etc). */
export const resetHeaders = () => {
  headers = DEFAULT_HEADERS();
  applyHeaders();
};

/**
 * Reset the ONE game instance to `fen` (default: standard start).
 * This is the only place in the whole app allowed to call
 * game.load()/game.reset() — everything else goes through here.
 */
export const resetGame = (fen = START_FEN) => {
  if (fen === START_FEN) {
    game.reset();
  } else {
    game.load(fen); // throws on invalid FEN — callers should try/catch
  }
  applyHeaders();
};

/**
 * Attempt a move on the live instance.
 * Returns the verbose move object on success, or null on an illegal move.
 * Never throws — callers don't need try/catch.
 */
export const makeMove = (from, to, promotion) => {
  try {
    const move = game.move(promotion ? { from, to, promotion } : { from, to });
    return move ?? null;
  } catch {
    // Some chess.js versions throw on illegal moves instead of returning
    // null — normalize both behaviours to "return null" for callers.
    return null;
  }
};

/**
 * Undo the last move on the live instance.
 * Used for single-step back-navigation — O(1), no reset+replay needed.
 * Returns the undone verbose move object, or null if there's nothing to undo.
 */
export const undoMove = () => {
  try {
    return game.undo() ?? null;
  } catch {
    return null;
  }
};

export const legalTargets = (square) =>
  game.moves({ square, verbose: true }).map((m) => m.to);

export const isOwnPiece = (square) => {
  const piece = game.get(square);
  return !!piece && piece.color === game.turn();
};

export const currentSide = () => game.turn();
export const isInCheck = () => game.inCheck();
export const isGameOver = () => game.isGameOver();

/** True if a pawn moving from→to would be a promotion. Check BEFORE moving. */
export const isPromotionMove = (from, to) => {
  const piece = game.get(from);
  if (!piece || piece.type !== "p") return false;
  const toRank = Number(to[1]);
  return (
    (piece.color === "w" && toRank === 8) ||
    (piece.color === "b" && toRank === 1)
  );
};