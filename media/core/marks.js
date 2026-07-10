// marks.js
// Renders / clears all visual marks on .mark-layer:
//   • selected-square highlight
//   • last-move highlight (from + to)
//   • legal-move hint dots / capture rings

import { markLayer } from "./board.js";
import { legalTargets } from "./game.js";
import { guiPieces } from "./piece.js";

// ─── Internal state ───────────────────────────────────────────────────────────
let hintMarks      = [];    // [{ square, domMark }]  — legal-move dots
let selectedMark   = null;  // single highlight div for selected square
let lastMoveMarks  = [];    // [div, div] — from / to highlight divs

// ─── Helpers ──────────────────────────────────────────────────────────────────
const makeMark = (square, ...classes) => {
  const el = document.createElement("div");
  el.classList.add("mark", ...classes);
  el.dataset.square = square;
  markLayer.append(el);
  return el;
};

// ─── Selected-square highlight ────────────────────────────────────────────────
export const setSelectedMark = (square) => {
  selectedMark?.remove();
  selectedMark = null;
  if (square) {
    selectedMark = makeMark(square, "selected-highlight");
  }
};

// ─── Last-move highlight ──────────────────────────────────────────────────────
export const setLastMoveMark = (from, to) => {
  lastMoveMarks.forEach((el) => el.remove());
  lastMoveMarks = [];
  if (from && to) {
    lastMoveMarks = [
      makeMark(from, "last-move-highlight"),
      makeMark(to,   "last-move-highlight"),
    ];
  }
};

// ─── Legal-move hints ─────────────────────────────────────────────────────────
export const clearHints = () => {
  hintMarks.forEach(({ domMark }) => domMark.remove());
  hintMarks = [];
};

export const showHints = (fromSquare, onMarkClick) => {
  clearHints();

  const targets = legalTargets(fromSquare);

  targets.forEach((toSquare) => {
    const classes = guiPieces[toSquare] ? ["hint", "capture"] : ["hint"];
    const domMark = makeMark(toSquare, ...classes);

    domMark.addEventListener("click", (e) => {
      e.stopPropagation();
      onMarkClick(fromSquare, toSquare);
    });

    hintMarks.push({ square: toSquare, domMark });
  });

  return targets;
};

// ─── Clear everything ─────────────────────────────────────────────────────────
/** Clears hints + selected highlight (call on deselect / move complete). */
export const clearMarks = () => {
  clearHints();
  setSelectedMark(null);
};

/** Full reset — also wipes last-move highlight (call on board reset). */
export const clearAllMarks = () => {
  clearMarks();
  setLastMoveMark(null, null);
};
