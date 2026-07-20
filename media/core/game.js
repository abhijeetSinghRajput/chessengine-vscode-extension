// game.js
import { Chess } from "../vendor/chess.esm.js";
import { clearGameEndBadges } from "./gameEndAnimation.js";
import { clearAllMarks } from "./marks.js";
import { updateCheckHighlight } from "./piece.js";
import { setDepthBadge, setMoveTime } from "./ui.js";

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

export const getHeaders = () => ({ ...headers });
export const setHeaders = (partial) => {
  headers = { ...headers, ...partial };
  applyHeaders();
};
export const resetHeaders = () => {
  headers = DEFAULT_HEADERS();
  applyHeaders();
};

// SINGLE reset function - everything uses this
export const resetGame = (fen = START_FEN) => {
  // Reset UI state
  document.getElementById("whiteBot")?.classList.remove("active");
  document.getElementById("blackBot")?.classList.remove("active");

  // Clear errors
  const uploadError = document.getElementById("upload-error");
  const exportError = document.getElementById("export-error");

  if(uploadError) uploadError.textContent = "";
  if(exportError) exportError.textContent = "";

  // Reset UI badges
  ["w", "b"].forEach((color) => {
    setDepthBadge({ color, depth: "", mate: "" });
    setMoveTime(color, "", "");
  });

  // Clear visual state
  clearGameEndBadges();
  clearAllMarks();
  updateCheckHighlight();

  // Reset game
  if (fen === START_FEN) {
    game.reset();
  } else {
    game.load(fen);
  }

  applyHeaders();
};

export const makeMove = (from, to, promotion) => {
  try {
    const move = game.move(promotion ? { from, to, promotion } : { from, to });
    return move ?? null;
  } catch {
    return null;
  }
};

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

export const isPromotionMove = (from, to) => {
  const piece = game.get(from);
  if (!piece || piece.type !== "p") return false;
  const toRank = Number(to[1]);
  return (
    (piece.color === "w" && toRank === 8) ||
    (piece.color === "b" && toRank === 1)
  );
};
