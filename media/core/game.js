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
