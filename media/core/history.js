// history.js
import { game } from "./game.js";
import { movePiece, addPiece, removePiece, updateCheckHighlight } from "./piece.js";
import { setLastMoveMark, clearMarks, clearAllMarks } from "./marks.js";
import { renderPosition } from "./board.js";

export const moveHistory = [];
let currentIndex = -1; // -1 = start position
let onMoveCallback = null; // Callback for when a move is recorded

const getMoveList = () => document.querySelector(".history-moves");

// ─── Set callback for move recording ────────────────────────────────────────
export const setOnMoveCallback = (callback) => {
  onMoveCallback = callback;
};

// ─── Are we at the latest move? ────────────────────────────────────────────
export const isLive = () => {
  return currentIndex === moveHistory.length - 1;
};

// ─── Get current index ─────────────────────────────────────────────────────
export const getCurrentIndex = () => currentIndex;

// ─── Get move history length ──────────────────────────────────────────────
export const getHistoryLength = () => moveHistory.length;

// ─── Called from executeMove after a real move is played ──────────────────
export const recordMove = (move) => {
  // If we're not at the end, truncate the history (branching)
  if (currentIndex < moveHistory.length - 1) {
    moveHistory.splice(currentIndex + 1);
  }

  moveHistory.push({ move, fen: game.fen() });
  currentIndex = moveHistory.length - 1;

  renderHistory();
  scrollToActive();

  // Call the callback if set
  if (onMoveCallback) {
    onMoveCallback(move);
  }
};

// ─── Step one move forward (apply GUI) ────────────────────────────────────
const stepForward = () => {
  if (currentIndex >= moveHistory.length - 1) return;
  currentIndex++;
  clearAllMarks();
  applyMoveGui(moveHistory[currentIndex].move);
  updateCheckHighlight();
  renderHistory();
  scrollToActive();
};

// ─── Step one move backward (reverse GUI) ──────────────────────────────────
const stepBack = () => {
  if (currentIndex < 0) return;
  reverseMoveGui(moveHistory[currentIndex].move);
  currentIndex--;

  clearAllMarks();

  const prev = moveHistory[currentIndex].move;
  setLastMoveMark(prev.from, prev.to);

  updateCheckHighlight();
  renderHistory();
  scrollToActive();
};

// ─── Apply a move forward on the GUI ──────────────────────────────────────
const applyMoveGui = (move) => {
  // Load the FEN from history to set game state
  if (currentIndex >= 0 && currentIndex < moveHistory.length) {
    const entry = moveHistory[currentIndex];
    if (entry && entry.fen) {
      try {
        game.load(entry.fen);
      } catch (e) {
        console.warn("Failed to load FEN for move:", entry.fen, e);
      }
    }
  }

  // Apply GUI changes
  if (move.flags.includes("e")) {
    removePiece(move.to[0] + move.from[1]);
  }
  if (move.flags.includes("k") || move.flags.includes("q")) {
    const rank = move.from[1];
    const ks = move.flags.includes("k");
    movePiece((ks ? "h" : "a") + rank, (ks ? "f" : "d") + rank);
  }
  if (move.flags.includes("c")) {
    removePiece(move.to);
  }
  movePiece(move.from, move.to);
  if (move.flags.includes("p")) {
    removePiece(move.to);
    addPiece(move.to, move.color + move.promotion);
  }
  setLastMoveMark(move.from, move.to);
};

// ─── Reverse a move on the GUI ──────────────────────────────────────────────
const reverseMoveGui = (move) => {
  // Load the previous FEN to set game state
  if (currentIndex - 1 >= 0) {
    const entry = moveHistory[currentIndex - 1];
    if (entry && entry.fen) {
      try {
        game.load(entry.fen);
      } catch (e) {
        console.warn("Failed to load FEN for previous position:", entry.fen, e);
      }
    }
  } else {
    // Reset to initial position
    game.reset();
  }

  // Apply GUI changes
  if (move.flags.includes("p")) {
    removePiece(move.to);
    addPiece(move.from, move.color + "p");
  } else {
    movePiece(move.to, move.from);
  }
  if (move.flags.includes("k") || move.flags.includes("q")) {
    const rank = move.from[1];
    const ks = move.flags.includes("k");
    movePiece((ks ? "f" : "d") + rank, (ks ? "h" : "a") + rank);
  }
  if (move.flags.includes("c")) {
    addPiece(move.to, (move.color === "w" ? "b" : "w") + move.captured);
  }
  if (move.flags.includes("e")) {
    addPiece(move.to[0] + move.from[1], move.color === "w" ? "bp" : "wp");
  }
};

// ─── Public navigation ──────────────────────────────────────────────────────
export const goForward = () => stepForward();
export const goBack = () => stepBack();
export const goFirst = () => {
  while (currentIndex >= 0) stepBack();
};
export const goLast = () => {
  while (currentIndex < moveHistory.length - 1) stepForward();
};

export const goTo = (index) => {
  if (index === currentIndex) return;
  if (index > currentIndex) {
    while (currentIndex < index) stepForward();
  } else {
    while (currentIndex > index) stepBack();
  }
};

// ─── Render move list ──────────────────────────────────────────────────────
export const renderHistory = () => {
  const moveList = getMoveList();
  if (!moveList) return;
  moveList.innerHTML = "";

  const rows = [];
  moveHistory.forEach((entry, idx) => {
    const { move } = entry;
    const moveNumber = Math.ceil((idx + 1) / 2);
    const rowIdx = moveNumber - 1;
    if (!rows[rowIdx]) rows[rowIdx] = { number: moveNumber };
    rows[rowIdx][move.color === "w" ? "white" : "black"] = {
      san: move.san,
      idx,
    };
  });

  rows.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.classList.add("history-row");

    const numEl = document.createElement("span");
    numEl.classList.add("move-num");
    numEl.textContent = row.number + ".";
    rowEl.append(numEl);

    for (const side of ["white", "black"]) {
      const entry = row[side];
      if (!entry) {
        const ph = document.createElement("span");
        ph.classList.add("move-btn", "placeholder");
        rowEl.append(ph);
        continue;
      }
      const btn = document.createElement("button");
      btn.classList.add("move-btn");
      btn.textContent = entry.san;
      if (entry.idx === currentIndex) btn.classList.add("active");
      btn.addEventListener("click", () => goTo(entry.idx));
      rowEl.append(btn);
    }

    moveList.append(rowEl);
    const activeBtn = moveList.querySelector(".move-btn.active");

    activeBtn?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  });
};

const scrollToActive = () => {
  getMoveList()
    ?.querySelector(".move-btn.active")
    ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
};

// ─── Hold-to-repeat nav buttons ──────────────────────────────────────────────
let repeatTimer = null;
let repeatInterval = null;

const startRepeat = (fn) => {
  fn();
  repeatTimer = setTimeout(() => {
    repeatInterval = setInterval(fn, 120);
  }, 400);
};

const stopRepeat = () => {
  clearTimeout(repeatTimer);
  clearInterval(repeatInterval);
  repeatTimer = repeatInterval = null;
};

const bindNavBtn = (selector, fn) => {
  const btn = document.querySelector(selector);
  if (!btn) return;
  btn.addEventListener("mousedown", () => startRepeat(fn));
  btn.addEventListener("touchstart", () => startRepeat(fn), { passive: true });
  btn.addEventListener("mouseup", stopRepeat);
  btn.addEventListener("mouseleave", stopRepeat);
  btn.addEventListener("touchend", stopRepeat);
  btn.addEventListener("touchcancel", stopRepeat);
};

export const initHistory = () => {
  bindNavBtn(".nav-first", goFirst);
  bindNavBtn(".nav-prev", goBack);
  bindNavBtn(".nav-next", goForward);
  bindNavBtn(".nav-last", goLast);
};

export const resetHistory = () => {
  moveHistory.length = 0;
  currentIndex = -1;
  renderHistory();
  // Clear check highlights on reset
  document.querySelectorAll('.square.in-check').forEach(el => el.classList.remove('in-check'));
};

// ─── Build history from moves (for PGN loading) ──────────────────────────

export const buildHistoryFromMoves = (moves) => {
  // Clear existing history
  moveHistory.length = 0;
  currentIndex = -1;

  // Reset game to start
  game.reset();

  // Clear the board and render initial position
  renderPosition(game.fen());
  clearAllMarks();
  updateCheckHighlight();

  // Play through each move and record it
  moves.forEach((move) => {
    const result = game.move(move);
    if (result) {
      moveHistory.push({ move: result, fen: game.fen() });
      currentIndex = moveHistory.length - 1;

      // Apply the move to the GUI
      applyMoveGui(result);
    }
  });

  // Render the history
  renderHistory();

  // Update check highlight
  updateCheckHighlight();

  // Navigate to the end
  goLast();
};
