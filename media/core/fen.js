// fen.js
export function parseFen(fen) {
  const [position] = fen.split(" ");

  const board = {};

  const map = {
    P: "wp",
    R: "wr",
    N: "wn",
    B: "wb",
    Q: "wq",
    K: "wk",

    p: "bp",
    r: "br",
    n: "bn",
    b: "bb",
    q: "bq",
    k: "bk",
  };

  const rows = position.split("/");

  for (let rank = 8; rank >= 1; rank--) {
    let file = 0;

    for (const char of rows[8 - rank]) {
      if (char >= "1" && char <= "8") {
        file += Number(char);
      } else {
        const square = String.fromCharCode(97 + file) + rank;

        board[square] = map[char];

        file++;
      }
    }
  }

  return board;
}
