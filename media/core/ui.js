/**
 * ui.js
 * Manages player-panel UI state (thinking indicator, depth badge).
 *
 * DOM contract:
 *   .player[data-color="w"]   — white player panel
 *   .player[data-color="b"]   — black player panel
 *   .player.thinking          — CSS class shown while engine is computing
 *   .loader                   — element inside the panel (shown via .thinking)
 *   sup#searchDepth            — inside each panel, shows current depth
 */
export const effectSquare = document.querySelector(".effect");
import { game } from "./game.js";
import { getVsCodeApi } from "./vscodeApi.js";

// Acquired once per webview session. Calling this twice throws, so guard it.
const vscode = getVsCodeApi();

/**
 * Toggle the thinking state for one side.
 *
 * @param {"w"|"b"} color
 * @param {boolean}  on
 */
export function setThinking(color, on) {
  const panel = document.querySelector(`.player[data-color="${color}"]`);
  if (!panel) return;
  panel.classList.toggle("thinking", on);
}

const themeButtons = document.querySelectorAll("button[data-theme]");

themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const theme = button.dataset.theme;
    document.documentElement.setAttribute("data-theme", theme);

    // Optional: highlight selected button
    themeButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
  });
});

const tabs = document.querySelectorAll(".tab-trigger");
const panels = document.querySelectorAll(".tab-panel");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));

    tab.classList.add("active");

    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

export function updateBookMove(to) {
  vscode.postMessage({
    command: "hasBookMove",
    fen: game.fen(),
    side: game.turn(),
    to,
  });
}

/**
 * Update the depth badge inside a player panel.
 *
 * @param {"w"|"b"} color
 * @param {number|string} depth
 */
export function setDepthBadge({ color, depth, mate } = {}) {
  const panel = document.querySelector(`.player[data-color="${color}"]`);

  if (!panel) return;

  const badge = panel.querySelector("sup");
  const mateBadge = panel.querySelector(".mate-in");

  if (badge) {
    badge.textContent = depth ? `d${depth}` : "";
  }

  if (mateBadge) {
    mateBadge.textContent = mate ? `M ${mate}` : "";
  }
}
/**
 * Update the time taken for a move.
 *
 * @param {"w"|"b"} color
 * @param {number} timeMs - Time in milliseconds
 */
export function setMoveTime(color, timeMs, nodes) {
  const panel = document.querySelector(`.player[data-color="${color}"]`);
  if (!panel) return;
  const timeSpan = panel.querySelector(".time span");
  const nodeSpan = panel.querySelector(".nodes span");

  if (timeSpan) {
    const seconds = (timeMs / 1000).toFixed(2);
    timeSpan.textContent = `${seconds}s`;
  }

  if (nodeSpan) {
    nodeSpan.textContent = formatNumber(nodes);
  }
}

function formatNumber(num, fixed = 2) {
  if (num == null) return "";

  const absNum = Math.abs(num);

  if (absNum >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(fixed) + "b";
  }
  if (absNum >= 1_000_000) {
    return (num / 1_000_000).toFixed(fixed) + "m";
  }
  if (absNum >= 1_000) {
    return (num / 1_000).toFixed(fixed) + "k";
  }
  return num.toString();
}

window.addEventListener("message", (event) => {
  const msg = event.data;

  switch (msg.command) {
    case "hasBookMoveResult":
      effectSquare.dataset.square = msg.hasBookMove ? msg.to : "";
      break;
  }
});
