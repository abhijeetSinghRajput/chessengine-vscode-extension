// piece.js
import { pieceLayer, squareLayer } from "./board.js";
import {
  game,
  makeMove,
  isOwnPiece,
  isPromotionMove,
  currentSide,
} from "./game.js";
import {
  showHints,
  clearMarks,
  setSelectedMark,
  setLastMoveMark,
} from "./marks.js";
import { askPromotion } from "./promotion.js";
import { playMoveSound, playIllegal, playGameEndSound } from "./sound.js";
import { recordMove } from "./history.js";
import { buildPGNFromHistory, showGameOverDialog } from "./dialog.js";
import { showGameEndBadges } from "./gameEndAnimation.js";
import { getVsCodeApi } from "./vscodeApi.js";

export const guiPieces = {};
export const clearGuiPieces = () => {
  for (const sq in guiPieces) {
    delete guiPieces[sq];
  }
};

// ─── Selection state ──────────────────────────────────────────────────────
let selectedSquare = null;

const setSelected = (square) => {
  selectedSquare = square;
  setSelectedMark(square);
};

// ─── Check highlight ──────────────────────────────────────────────────────
export const updateCheckHighlight = () => {
  squareLayer
    .querySelectorAll(".square.in-check")
    .forEach((sq) => sq.classList.remove("in-check"));

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

// ─── Piece primitives ─────────────────────────────────────────────────────
// This is the ONLY thing that drives the move animation: swapping the
// `data-square` attribute. Positioning + the transition itself lives
// entirely in CSS (see the .piece[data-square] rules) — there is no JS
// animation loop, so this stays cheap even during rapid autoplay/navigation.
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
  guiPieces[from].dataset.square = to; // ← triggers the CSS transition
  guiPieces[to] = guiPieces[from];
  delete guiPieces[from];
};

// ─── Special move GUI effects ─────────────────────────────────────────────
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

// ─── Core move executor ───────────────────────────────────────────────────
// `game` is the single source of truth: makeMove() is the ONLY thing that
// advances it during live play. If the user is mid-history when this runs,
// `game` is already sitting at that historical position (history.js keeps
// it in sync on every navigation), so this naturally branches — no special
// "am I in history?" check needed here.
export const executeMove = async (from, to, promotion) => {
  let promo = promotion;

  if (!promotion && isPromotionMove(from, to)) {
    promo = await askPromotion(to, currentSide());
  }

  const move = makeMove(from, to, promo);

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

  recordMove(move); // bookkeeping only — never touches `game`

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

    getVsCodeApi()?.postMessage({
      command: "commitGameToHistory",
      pgn: buildPGNFromHistory(),
    });
  }

  return move;
};

// ─── Click handler ────────────────────────────────────────────────────────
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

// ─── Click on board background → deselect ────────────────────────────────
export const handleBoardClick = () => {
  clearMarks();
  setSelected(null);
};

// ─── Drag & Drop ─────────────────────────────────────────────────────────
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