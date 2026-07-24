// history.js
// ────────────────────────────────────────────────────────────────────────
// Move list + navigation cursor (Chess.com / Lichess pattern).
//
//   moves        — flat array of chess.js verbose move objects, in order
//   currentIndex — index of the move currently applied to `game`
//                  (-1 = start position, moves.length - 1 = live tip)
//
// INVARIANT: after any exported function here returns, `game`'s actual
// position (game.fen(), game.turn(), game.moves(), game.inCheck(), …)
// exactly equals moves[0..currentIndex] replayed from startFen. Nothing
// outside this file is allowed to move currentIndex or touch `game`'s
// position — that's what made the old code impossible to keep in sync.
//
// Navigation cost:
//   • single step (◀ / ▶, autoplay tick)
//       → O(1): game.move() / game.undo().
//       → GUI: exactly the squares that changed get a new `data-square`
//         via movePiece() — your existing CSS transition animates that
//         natively, no JS animation loop, no full re-render.
//   • multi-step jump (Home/End, clicking a far-away move, loading a PGN)
//       → O(n) replay onto `game`, but only ONE full board snap-render
//         and ONE sound — not N. This matches how lichess/chess.com
//         behave: jumps snap instantly, they don't animate every
//         intermediate move.
// ────────────────────────────────────────────────────────────────────────

import { game, resetGame, makeMove, undoMove, START_FEN } from "./game.js";
import {
  movePiece,
  addPiece,
  removePiece,
  updateCheckHighlight,
} from "./piece.js";
import { setLastMoveMark, clearAllMarks } from "./marks.js";
import { showGameEndBadges, clearGameEndBadges } from "./gameEndAnimation.js";
import { renderPosition } from "./board.js";
import { playGameEndSound, playMoveSound } from "./sound.js";
import { effectSquare, updateBookMove } from "./ui.js";

export const moves = []; // chess.js verbose move objects
let currentIndex = -1;
let startFen = START_FEN;
let onMoveCallback = null;

export const getStartFen = () => startFen;
export const getCurrentIndex = () => currentIndex;
export const getHistoryLength = () => moves.length;
export const isLive = () => currentIndex === moves.length - 1;

const getMoveList = () => document.querySelector(".history-moves");

export const setOnMoveCallback = (callback) => {
  onMoveCallback = callback;
};

// ─── Recording a move played live (or branching from a historical point) ──
// By the time this runs, `game` has ALREADY been advanced by game.js's
// makeMove() (see piece.js#executeMove). This function only updates the
// bookkeeping array — it never touches `game` itself.
export const recordMove = (move) => {
  stopAutoPlay();

  // Branching: if we weren't at the tip, everything after currentIndex is
  // a dead line the moment a new move is played from here — exactly what
  // chess.com/lichess do.
  if (currentIndex < moves.length - 1) {
    moves.splice(currentIndex + 1);
  }

  moves.push(move);
  currentIndex = moves.length - 1;

  renderHistory();
  onMoveCallback?.(move);
};

const syncGameEndBadges = () => {
  // Only the LIVE tip shows the winner/draw badges — browsing history
  // shouldn't re-trigger "Game Over" UI for a position that isn't final.
  if (!isLive()) {
    clearGameEndBadges();
    return;
  }
  if (game.isGameOver()) {
    playGameEndSound();
    showGameEndBadges();
  } else {
    clearGameEndBadges();
  }
};

// ─── Single-step forward — O(1), animated ──────────────────────────────
const stepForward = () => {
  if (currentIndex >= moves.length - 1) return;

  const target = moves[currentIndex + 1];
  const applied = makeMove(target.from, target.to, target.promotion);
  if (!applied) {
    console.warn("[history] desync stepping forward — resyncing", target);
    jumpTo(currentIndex + 1);
    return;
  }

  currentIndex++;

  clearAllMarks();
  applyMoveGui(applied);
  updateCheckHighlight();
  updateActiveHighlight();
  syncGameEndBadges();

  playMoveSound(applied, game, applied.color);
};

// ─── Single-step back — O(1), animated ─────────────────────────────────
const stepBack = () => {
  if (currentIndex < 0) return;

  const undone = undoMove();
  if (!undone) {
    console.warn("[history] desync stepping back — resyncing");
    jumpTo(currentIndex - 1);
    return;
  }

  reverseMoveGui(undone);
  currentIndex--;

  clearAllMarks();
  if (currentIndex >= 0) {
    const prev = moves[currentIndex];
    setLastMoveMark(prev.from, prev.to);
    updateBookMove(prev.to);
  }
  else{
    effectSquare.dataset.square = "";
  }

  updateCheckHighlight();
  updateActiveHighlight();
  syncGameEndBadges();

  playMoveSound(undone, game, undone.color);
};

// ─── Multi-step jump — reset + replay, ONE snap render, no animation ──
const jumpTo = (index) => {
  resetGame(startFen);
  for (let i = 0; i <= index; i++) {
    const m = moves[i];
    makeMove(m.from, m.to, m.promotion);
  }
  currentIndex = index;

  renderPosition(game.fen()); // one full snap — cheap (32 DOM nodes, no anim)
  clearAllMarks();
  updateCheckHighlight();

  if (index >= 0) {
    const last = moves[index];
    setLastMoveMark(last.from, last.to);
    playMoveSound(last, game, last.color);
  }

  updateActiveHighlight();
  syncGameEndBadges();
};

// ─── Public navigation — everything funnels through here ──────────────
export const navigateTo = (index) => {
  stopAutoPlay();

  index = Math.max(-1, Math.min(index, moves.length - 1));
  const delta = index - currentIndex;

  if (delta === 0) return;
  if (delta === 1) return stepForward();
  if (delta === -1) return stepBack();
  jumpTo(index);
};

export const goForward = () => navigateTo(currentIndex + 1);
export const goBack = () => navigateTo(currentIndex - 1);
export const goFirst = () => navigateTo(-1);
export const goLast = () => navigateTo(moves.length - 1);
export const goTo = (index) => navigateTo(index);

// ─── GUI-only diff appliers ─────────────────────────────────────────────
// `game` is ALREADY at the target position by the time these run — these
// only reconcile the DOM piece layer, they never touch game state.
const applyMoveGui = (move) => {
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
  updateBookMove(move.to);
};

const reverseMoveGui = (move) => {
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

// ─── Auto-play (Play/Pause) ─────────────────────────────────────────────
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
  if (autoPlayTimer || moves.length === 0) return;

  // Restart from the start with ONE snap, not N animated steps.
  if (currentIndex >= moves.length - 1) {
    jumpTo(-1);
  }

  setPlayButtonState(true);
  autoPlayTimer = setInterval(() => {
    if (currentIndex >= moves.length - 1) {
      stopAutoPlay();
      return;
    }
    stepForward();
  }, AUTO_PLAY_SPEED);
};

export const toggleAutoPlay = () => {
  if (isAutoPlaying()) stopAutoPlay();
  else startAutoPlay();
};

// ─── Move list rendering (pure SAN text — never touches `game`) ────────
const getStartColor = () => (startFen.split(" ")[1] === "b" ? "b" : "w");

export const renderHistory = () => {
  const moveList = getMoveList();
  if (!moveList) return;
  moveList.innerHTML = "";

  const blackStarts = getStartColor() === "b";
  const rows = [];

  moves.forEach((move, idx) => {
    const adjustedIdx = blackStarts ? idx + 1 : idx;
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
  });

  scrollToActive();
};

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
  if (btnRect.bottom > listRect.bottom) deltaY = btnRect.bottom - listRect.bottom;
  else if (btnRect.top < listRect.top) deltaY = btnRect.top - listRect.top;

  let deltaX = 0;
  if (btnRect.right > listRect.right) deltaX = btnRect.right - listRect.right;
  else if (btnRect.left < listRect.left) deltaX = btnRect.left - listRect.left;

  if (deltaX || deltaY) {
    moveList.scrollBy({ top: deltaY, left: deltaX, behavior: "smooth" });
  }
};

// ─── Hold-to-repeat nav buttons (unchanged) ────────────────────────────
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

// ─── Reset for a brand-new game ────────────────────────────────────────
export const resetHistory = (fen) => {
  stopAutoPlay();
  startFen = fen || START_FEN;
  moves.length = 0;
  currentIndex = -1;
  renderHistory();
  document
    .querySelectorAll(".square.in-check")
    .forEach((el) => el.classList.remove("in-check"));
};

// ─── Build history from a loaded PGN's verbose move list ──────────────
// `fen` lets a PGN with [SetUp "1"]/[FEN "..."] headers start from a
// custom position instead of always assuming the standard start.
export const buildHistoryFromMoves = (verboseMoves, fen = START_FEN) => {
  stopAutoPlay();

  moves.length = 0;
  currentIndex = -1;
  startFen = fen;

  resetGame(startFen);

  verboseMoves.forEach((vm) => {
    const applied = makeMove(vm.from, vm.to, vm.promotion);
    if (applied) moves.push(applied);
  });
  currentIndex = moves.length - 1;

  // Render exactly ONCE, after the full replay — at the final position.
  // (Rendering before the loop and never again was the bug: `game` ended
  // up correct, but the DOM piece layer was left frozen at move 0.)
  renderPosition(game.fen());
  clearAllMarks();
  updateCheckHighlight();

  renderHistory();
  updateActiveHighlight();
  syncGameEndBadges();

  if (currentIndex >= 0) {
    setLastMoveMark(moves[currentIndex].from, moves[currentIndex].to);
  }
};