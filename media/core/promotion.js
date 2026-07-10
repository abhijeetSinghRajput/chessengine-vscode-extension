// promotion.js
// Shows the promotion picker and resolves a Promise with the chosen piece.
// Caller: executeMove() in piece.js

const whiteWindow = document.querySelector(".promotion-window.white");
const blackWindow = document.querySelector(".promotion-window.black");

/**
 * Returns a Promise<'q'|'r'|'b'|'n'> that resolves when the user picks.
 * @param {string} toSquare  - e.g. "e8" or "d1"
 * @param {string} color     - 'w' | 'b'
 */
export const askPromotion = (toSquare, color) => {
  return new Promise((resolve) => {
    const file = toSquare[0];               // 'a'..'h'
    const window_ = color === "w" ? whiteWindow : blackWindow;

    // Position the window over the correct file
    window_.dataset.file = file;
    window_.style.display = "flex";

    // Map piece class → letter
    const pieceMap = { wq: "q", wr: "r", wb: "b", wn: "n",
                       bq: "q", br: "r", bb: "b", bn: "n" };

    const pieces = window_.querySelectorAll(".piece");

    const cleanup = () => {
      window_.style.display = "none";
      pieces.forEach((p) => p.removeEventListener("click", onPick));
    };

    const onPick = (e) => {
      const cls = [...e.currentTarget.classList].find((c) => pieceMap[c]);
      cleanup();
      resolve(pieceMap[cls] ?? "q");
    };

    pieces.forEach((p) => p.addEventListener("click", onPick, { once: true }));
  });
};
