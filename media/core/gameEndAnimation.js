import { game } from "./game.js";
import { domBoard, gameEndLayer } from "./board.js";

// Icons lifted from the chess.com inspect-element markup, ids stripped
// (we render up to two "draw" badges at once, duplicate ids are invalid).
const ICONS = {
  draw: `
    <svg xmlns="http://www.w3.org/2000/svg" class="icon slide" width="70%" height="70%" viewBox="0 0 18 19">
      <g>
        <path d="M2.92,7V5.84c.81,0,1.75-.28,1.8-1.22H6.14v5.5H4.34V7Zm8.87-2.39L7,13.88H5l4.8-9.26ZM9.85,13.88c-.08-1.54,1.38-2.19,2.57-2.89.33-.17.78-.4.78-.78a.66.66,0,0,0-.68-.7c-.69,0-.94.58-.92,1.16H10a2.17,2.17,0,0,1,.64-1.79,2.74,2.74,0,0,1,1.91-.62C14.1,8.26,15,8.78,15,10c0,1.82-2.66,2.18-2.66,2.5h2.73v1.38Z"></path>
        <path class="icon-component-shadow" fill="#fff" d="M2.92,6.51V5.34c.81,0,1.75-.28,1.8-1.22H6.14v5.5H4.34V6.51Zm8.87-2.39L7,13.38H5l4.8-9.26ZM9.85,13.38c-.08-1.54,1.38-2.19,2.57-2.89.33-.17.78-.4.78-.78a.66.66,0,0,0-.68-.7c-.69,0-.94.58-.92,1.16H10a2.17,2.17,0,0,1,.64-1.79,2.74,2.74,0,0,1,1.91-.62C14.1,7.76,15,8.28,15,9.5c0,1.82-2.66,2.18-2.66,2.5h2.73v1.38Z"></path>
      </g>
    </svg>`,
  winner: `
    <svg xmlns="http://www.w3.org/2000/svg" class="icon slide" width="70%" height="70%" viewBox="0 0 18 19">
      <g>
        <path d="m 24.4334,39.6517 c 15.9034,0 22.8584,-4.7017 22.8584,-4.7017 l 0.975,-23.6167 c 0,-2.16663 -1.495,-2.79497 -3.25,-1.4083 L 34.1834,17.53 26.6868,2.66667 C 26.0151,0.911667 25.1484,0.5 24.5201,0.5 23.8918,0.5 22.9384,0.955 22.3534,2.66667 L 14.6834,17.53 3.85008,9.925 C 2.09508,8.53833 0.513416,9.16667 0.600083,11.3333 L 1.57508,34.95 c 0,0 6.955,4.55 22.85832,4.7017 z" fill="white" transform="matrix(0.25173118,0,0,0.25173118,2.8497971,2.8741344)"></path>
      </g>
    </svg>`,
  checkmate: `
    <svg xmlns="http://www.w3.org/2000/svg" class="icon slide" width="70%" height="70%" viewBox="0 0 18 19">
      <g>
        <path d="m 9.9742023,6.6728298 2.42e-5,-2.42e-5 -0.00213,-0.00204 C 9.7700909,6.4784115 9.5898002,6.3078138 9.4249699,6.1860933 9.2615451,6.0654149 9.0947034,5.9782259 8.9192108,5.9782259 c -0.25168,0 -0.4344667,0.1056058 -0.549814,0.2695152 -0.1111793,0.1579967 -0.1529321,0.3598302 -0.1529321,0.5495475 0,0.3631985 0.1493457,0.7186669 0.3948949,1.0255973 l 0.036373,0.045485 h 0.058231 1.8222934 0.121163 V 7.7472074 c 0,-0.062738 0.0045,-0.1263489 0.0094,-0.192189 l 6.79e-4,-0.00921 c 0.0046,-0.061284 0.0093,-0.1257673 0.0093,-0.1863246 V 7.30329 l -0.04289,-0.0363 C 10.37581,7.055366 10.165155,6.8638071 9.9742023,6.6728298 Z M 8.7059637,10.223781 h -0.058231 l -0.036373,0.04546 c -0.2455492,0.306954 -0.3948949,0.662399 -0.3948949,1.025621 0,0.189718 0.041753,0.391551 0.1529321,0.549524 0.1153473,0.163909 0.298134,0.269539 0.549814,0.269539 0.1754926,0 0.3423343,-0.08719 0.5057591,-0.207867 0.1648303,-0.121721 0.345121,-0.292319 0.5471241,-0.484677 l 2.43e-5,2.4e-5 0.00208,-0.0021 c 0.1909566,-0.19096 0.4016116,-0.382519 0.6517156,-0.594143 l 0.04289,-0.0363 v -0.0562 c 0,-0.06056 -0.0048,-0.125041 -0.0093,-0.186349 l -6.79e-4,-0.0092 c -0.0049,-0.06584 -0.0094,-0.12945 -0.0094,-0.192188 V 10.223781 H 10.528257 Z M 14.663966,4.902295 h 0.208401 v 0.2084006 9.93e-5 l 0.0065,7.8706591 v 9.7e-5 0.208304 H 14.670436 14.55412 c -0.512351,0 -0.925154,-0.0027 -1.261842,-0.179928 l -0.0024,-0.0013 -0.0024,-0.0011 c -0.294717,-0.138683 -0.506995,-0.38084 -0.634046,-0.780096 l -0.04771,-0.149976 -0.132794,0.0845 c -0.389055,0.247585 -0.730662,0.573344 -1.056979,0.884515 -0.04173,0.03979 -0.08319,0.07931 -0.124459,0.118425 l -2.4e-5,-2.4e-5 -0.0023,0.0023 -0.02246,0.02249 c -0.696009,0.69613 -1.3763643,1.376606 -2.4702007,1.376606 -1.5837231,0 -2.7092072,-1.111695 -2.7092072,-2.631662 0,-0.757682 0.1705492,-1.383417 0.3033682,-1.762875 L 6.435997,10.042013 6.3016271,10.013224 5.7588163,9.8969076 5.6122817,9.8655021 v 0.1498789 0.770597 H 5.4038811 4.2794826 4.0904681 V 9.9378365 9.8166734 H 3.969305 3.3101776 3.1211632 V 9.6082728 8.4838791 8.2754786 H 3.3101776 3.969305 4.0904681 V 8.1543154 7.3061736 H 4.2794826 5.4038811 5.6122817 V 8.076771 8.2255594 L 5.7579924,8.195414 6.3201893,8.0790974 6.4618774,8.0498001 6.4081295,7.9154545 C 6.2579357,7.5399458 6.0872411,6.9154711 6.0872411,6.1575473 c 0,-1.5199695 1.1254841,-2.6316648 2.7092072,-2.6316648 0.9968332,0 1.6502897,0.5651455 2.2851117,1.1922446 h -0.0173 l 0.220735,0.2091227 c 0.04129,0.039104 0.08276,0.078642 0.124459,0.1184175 0.326317,0.3111784 0.667924,0.6369448 1.057003,0.8845295 l 0.13277,0.084499 0.04774,-0.1499757 C 12.773991,5.465466 12.986269,5.2233118 13.280986,5.0846237 l 0.0024,-0.00115 0.0024,-0.00126 C 13.622521,4.9050091 14.035323,4.902295 14.547649,4.902295 Z" fill="white" stroke="white" style="fill:#ffffff;fill-opacity:1;stroke:#ffffff;stroke-width:0.242326;stroke-opacity:1;"></path>
      </g>
    </svg>`,
};

function findKingSquare(color) {
  const board = game.board();
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.type === "k" && cell.color === color) {
        return cell.square;
      }
    }
  }
  return null;
}

function createBadge({ square, colorClass, iconKey, label, squareSizePx }) {
  const el = document.createElement("div");
  el.className = `animated-effect ${colorClass}`;
  el.dataset.square = square;
  el.style.setProperty("--square-size", `${squareSizePx}px`);
  el.style.setProperty("--target-icon-size", "18.75%");

  el.innerHTML = `
    <div class="square ${colorClass}"></div>
    <div>${ICONS[iconKey]}</div>
    <div class="icon-background ${colorClass}"></div>
    <div class="text">${label}</div>
  `;
  return el;
}

/** Remove any badges left over from a previous game. */
export function clearGameEndBadges() {
  gameEndLayer.innerHTML = "";
}

/**
 * Inspect the current game state and render the appropriate
 * winner / checkmate / draw badge(s) on the relevant king square(s).
 * No-op if the game isn't actually over.
 */
export function showGameEndBadges() {
  clearGameEndBadges();
  if (!game.isGameOver()) return;

  const squareSizePx = domBoard.clientWidth / 8;

  if (game.isCheckmate()) {
    // side to move is the one who got mated
    const loserColor = game.turn();
    const winnerColor = loserColor === "w" ? "b" : "w";
    const loserSquare = findKingSquare(loserColor);
    const winnerSquare = findKingSquare(winnerColor);
    const loserClass = loserColor === "w" ? "checkmatewhite" : "checkmateblack";

    if (winnerSquare) {
      gameEndLayer.append(createBadge({
        square: winnerSquare, colorClass: "winner",
        iconKey: "winner", label: "Winner", squareSizePx,
      }));
    }
    if (loserSquare) {
      gameEndLayer.append(createBadge({
        square: loserSquare, colorClass: loserClass,
        iconKey: "checkmate", label: "Checkmate", squareSizePx,
      }));
    }
    return;
  }

  // Everything else that ends the game (stalemate, insufficient material,
  // threefold repetition, 50-move rule, plain draw) gets the two draw badges.
  const whiteKing = findKingSquare("w");
  const blackKing = findKingSquare("b");

  if (whiteKing) {
    gameEndLayer.append(createBadge({
      square: whiteKing, colorClass: "drawwhite",
      iconKey: "draw", label: "Draw", squareSizePx,
    }));
  }
  if (blackKing) {
    gameEndLayer.append(createBadge({
      square: blackKing, colorClass: "drawblack",
      iconKey: "draw", label: "Draw", squareSizePx,
    }));
  }
}

// Keep badge sizing correct if the window/board is resized while a
// game-over badge is still showing.
window.addEventListener("resize", () => {
  if (!gameEndLayer.childElementCount) return;
  const squareSizePx = domBoard.clientWidth / 8;
  gameEndLayer.querySelectorAll("[data-square]").forEach((el) => {
    el.style.setProperty("--square-size", `${squareSizePx}px`);
  });
});