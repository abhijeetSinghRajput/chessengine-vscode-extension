// history.js
import { game } from "./game.js";
import {
  movePiece,
  addPiece,
  removePiece,
  updateCheckHighlight,
} from "./piece.js";
import { setLastMoveMark, clearMarks, clearAllMarks } from "./marks.js";
import { showGameEndBadges, clearGameEndBadges } from "./gameEndAnimation.js"; // NEW
import { renderPosition } from "./board.js";
import { playMoveSound } from "./sound.js";

export const moveHistory = [];
let currentIndex = -1; // -1 = start position
let onMoveCallback = null; // Callback for when a move is recorded
let startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const getStartFen = () => startFen;
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
  // A new move was played manually/by a bot — auto-play no longer makes sense.
  stopAutoPlay();

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

const syncGameEndBadges = () => {
  if (game.isGameOver()) {
    showGameEndBadges();
  } else {
    clearGameEndBadges();
  }
};

// ─── Step one move forward (apply GUI) ────────────────────────────────────
const stepForward = () => {
  if (currentIndex >= moveHistory.length - 1) return;

  currentIndex++;

  const move = moveHistory[currentIndex].move;

  clearAllMarks();
  applyMoveGui(move);
  updateCheckHighlight();
  updateActiveHighlight();
  syncGameEndBadges();

  playMoveSound(move, game, move.color);
};

// ─── Step one move backward (reverse GUI) ──────────────────────────────────
const stepBack = () => {
  if (currentIndex < 0) return;

  const move = moveHistory[currentIndex].move;

  reverseMoveGui(move);
  currentIndex--;
  clearAllMarks();
  if (currentIndex >= 0) {
    const prev = moveHistory[currentIndex].move;
    setLastMoveMark(prev.from, prev.to);
  }

  updateCheckHighlight();
  updateActiveHighlight();
  syncGameEndBadges();

  playMoveSound(move, game, move.color);
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
    // currentIndex - 1 < 0 → stepping back to the very start of the game,
    // which may not be the standard position (e.g. a custom FEN was loaded).
    try {
      game.load(startFen);
    } catch (e) {
      console.warn(
        "Failed to load start FEN, falling back to default:",
        startFen,
        e,
      );
      game.reset();
    }
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

// ─── Auto-play (Play/Pause) ─────────────────────────────────────────────────
let autoPlayTimer = null;
let playBtn = null;
const AUTO_PLAY_SPEED = 800; // ms between moves

export const isAutoPlaying = () => autoPlayTimer !== null;

const setPlayButtonState = (playing) => {
  playBtn?.classList.toggle("playing", playing);
  if (playBtn) playBtn.title = playing ? "Pause" : "Play/Pause";
};

export const stopAutoPlay = () => {
  if (autoPlayTimer) {
    clearInterval(autoPlayTimer);
    autoPlayTimer = null;
  }
  setPlayButtonState(false);
};

const startAutoPlay = () => {
  if (autoPlayTimer || moveHistory.length === 0) return;

  // If we're at (or past) the last move, restart from the beginning.
  if (currentIndex >= moveHistory.length - 1) {
    while (currentIndex >= 0) stepBack();
    clearAllMarks();
    updateCheckHighlight();
    updateActiveHighlight();
  }

  setPlayButtonState(true);
  autoPlayTimer = setInterval(() => {
    if (currentIndex >= moveHistory.length - 1) {
      stopAutoPlay();
      return;
    }
    stepForward();
  }, AUTO_PLAY_SPEED);
};

export const toggleAutoPlay = () => {
  if (isAutoPlaying()) {
    stopAutoPlay();
  } else {
    startAutoPlay();
  }
};

// Wraps a manual nav function so any user-driven navigation interrupts auto-play.
const manual =
  (fn) =>
  (...args) => {
    stopAutoPlay();
    fn(...args);
  };

// ─── Public navigation ──────────────────────────────────────────────────────
export const goForward = manual(() => stepForward());
export const goBack = manual(() => stepBack());
export const goFirst = manual(() => {
  while (currentIndex >= 0) stepBack();
});
export const goLast = manual(() => {
  while (currentIndex < moveHistory.length - 1) stepForward();
});

export const goTo = manual((index) => {
  if (index === currentIndex) return;
  if (index > currentIndex) {
    while (currentIndex < index) stepForward();
  } else {
    while (currentIndex > index) stepBack();
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────
const getStartColor = () => {
  // FEN field 2 (space-separated) is the active color: "w" or "b"
  const parts = startFen.split(" ");
  return parts[1] === "b" ? "b" : "w";
};

// ─── Render move list ──────────────────────────────────────────────────────
export const renderHistory = () => {
  const moveList = getMoveList();
  if (!moveList) return;
  moveList.innerHTML = "";

  const blackStarts = getStartColor() === "b";

  const rows = [];
  moveHistory.forEach((entry, idx) => {
    const { move } = entry;
    const adjustedIdx = blackStarts ? idx + 1 : idx; // shift so pairing matches real move numbers
    const moveNumber = Math.ceil((adjustedIdx + 1) / 2);
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
        // Only happens when the position starts with Black to move —
        // mirrors chess.com's "1. … b5" style.
        if (side === "white" && row.black) {
          ph.textContent = "…";
          ph.classList.add("ellipsis");
        }
        rowEl.append(ph);
        continue;
      }
      const btn = document.createElement("button");
      btn.classList.add("move-btn");
      btn.dataset.idx = entry.idx;
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

// ─── Lightweight active-move highlight (no DOM rebuild) ───────────────────
const updateActiveHighlight = () => {
  const moveList = getMoveList();
  if (!moveList) return;

  moveList.querySelector(".move-btn.active")?.classList.remove("active");

  if (currentIndex >= 0) {
    moveList
      .querySelector(`.move-btn[data-idx="${currentIndex}"]`)
      ?.classList.add("active");
  }

  scrollToActive();
};

const scrollToActive = () => {
  const moveList = getMoveList();
  const activeBtn = moveList?.querySelector(".move-btn.active");
  if (!moveList || !activeBtn) return;

  const listRect = moveList.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();

  let deltaY = 0;
  if (btnRect.bottom > listRect.bottom) {
    deltaY = btnRect.bottom - listRect.bottom; // scroll down to reveal bottom
  } else if (btnRect.top < listRect.top) {
    deltaY = btnRect.top - listRect.top; // scroll up to reveal top
  }

  let deltaX = 0;
  if (btnRect.right > listRect.right) {
    deltaX = btnRect.right - listRect.right; // scroll right to reveal right edge
  } else if (btnRect.left < listRect.left) {
    deltaX = btnRect.left - listRect.left; // scroll left to reveal left edge
  }

  if (deltaX || deltaY) {
    moveList.scrollBy({ top: deltaY, left: deltaX, behavior: "smooth" });
  }
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

  playBtn = document.querySelector(".btn.play");
  playBtn?.addEventListener("click", toggleAutoPlay);
};

export const resetHistory = (fen) => {
  stopAutoPlay();
  if (fen) startFen = fen;
  moveHistory.length = 0;
  currentIndex = -1;
  renderHistory();
  document
    .querySelectorAll(".square.in-check")
    .forEach((el) => el.classList.remove("in-check"));
};

// ─── Build history from moves (for PGN loading) ──────────────────────────

export const buildHistoryFromMoves = (moves) => {
  stopAutoPlay();

  // Clear existing history
  moveHistory.length = 0;
  currentIndex = -1;

  // PGN loading is always from the standard start
  startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
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
