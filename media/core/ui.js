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

/**
 * Update the depth badge inside a player panel.
 *
 * @param {"w"|"b"} color
 * @param {number|string} depth
 */
export function setDepthBadge(color, depth) {
  const panel = document.querySelector(`.player[data-color="${color}"]`);
  if (!panel) return;
  const badge = panel.querySelector("sup");
  if (badge) badge.textContent = depth != null ? `d${depth}` : "";
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
