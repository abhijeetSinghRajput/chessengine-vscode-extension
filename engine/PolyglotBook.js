/* ======================== USAGE ============
```
const { PolyglotBook } = require("./polyglotBook");

const book = new PolyglotBook();
book.load("./komodo.bin");

const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

console.log(book.getMoves(fen));
```
[{ from: 'g8', to: 'f6', promotion: null, uci: 'g8f6', weight: 120, learn: 0 }, ...]

*/
const fs = require("fs");

const {
  enPassantPolyKeys, // size [8]
  castlePolyKeys, // size [4] -> order: [WK, WQ, BK, BQ]
  piecePolyKeys, // size [12 x 64]
  polyPieces, // maps piece char ('P','n', ...) -> 0..11
  sidePolyKey, // BigInt
} = require("./polyglotZobrist");

const FILES = "abcdefgh";

function squareName(sq) {
  const file = sq % 8;
  const rank = Math.floor(sq / 8);
  return FILES[file] + (rank + 1);
}

/**
 * Parses a FEN string into a flat 64-square board (a1 = 0, h8 = 63),
 * side to move, castling rights, and en-passant target square.
 */
function parseFen(fen) {
  const parts = fen.trim().split(/\s+/);
  const [placement, activeColor = "w", castling = "-", epTarget = "-"] = parts;

  if (!placement) {
    throw new Error(`Invalid FEN: ${fen}`);
  }

  const board = new Array(64).fill(null);
  const ranks = placement.split("/");

  if (ranks.length !== 8) {
    throw new Error(`Invalid FEN board: ${placement}`);
  }

  for (let r = 0; r < 8; r++) {
    const rank = 8 - r; // FEN lists rank 8 first
    const rankStr = ranks[r];
    let file = 0;

    for (const ch of rankStr) {
      if (ch >= "1" && ch <= "8") {
        file += Number(ch);
        continue;
      }

      const sq = (rank - 1) * 8 + file;
      board[sq] = ch;
      file++;
    }

    if (file !== 8) {
      throw new Error(`Invalid FEN rank: ${rankStr}`);
    }
  }

  const turn = activeColor === "b" ? "b" : "w";

  const castlingRights = {
    K: castling.includes("K"),
    Q: castling.includes("Q"),
    k: castling.includes("k"),
    q: castling.includes("q"),
  };

  let epSquare = null;
  if (epTarget && epTarget !== "-") {
    const file = FILES.indexOf(epTarget[0]);
    const rank = Number(epTarget[1]);
    if (file >= 0 && rank >= 1 && rank <= 8) {
      epSquare = (rank - 1) * 8 + file;
    }
  }

  return { board, turn, castling: castlingRights, epSquare };
}

class PolyglotBook {
  constructor() {
    this.positions = new Map(); // Map<BigInt, Entry[]>
  }

  load(path) {
    this.positions.clear();

    const data = fs.readFileSync(path);

    if (data.length % 16 !== 0) {
      console.warn(`Book file size is not a multiple of 16 bytes: ${path}`);
    }

    for (let i = 0; i + 16 <= data.length; i += 16) {
      const key =
        (BigInt(data.readUInt32BE(i)) << 32n) |
        BigInt(data.readUInt32BE(i + 4));

      const move = data.readUInt16BE(i + 8);
      const weight = data.readUInt16BE(i + 10);
      const learn = data.readUInt32BE(i + 12);

      let list = this.positions.get(key);
      if (!list) {
        list = [];
        this.positions.set(key, list);
      }

      list.push({ move, weight, learn });
    }

    console.log(`${this.positions.size} positions loaded`);
    return this.positions.size;
  }

  /**
   * True if a pawn belonging to `turn` is positioned to actually make
   * the en-passant capture on `epSquare`. Polyglot only XORs the
   * en-passant key in when the capture is legally available.
   */
  hasPawnToCapture(board, epSquare, turn) {
    if (epSquare == null) return false;

    if (turn === "w") {
      return board[epSquare - 9] === "P" || board[epSquare - 7] === "P";
    }

    return board[epSquare + 7] === "p" || board[epSquare + 9] === "p";
  }

  /**
   * Computes the 64-bit polyglot zobrist key for a position given as FEN.
   */
  getPolyKey(fen) {
    const { board, turn, castling, epSquare } = parseFen(fen);

    let key = 0n;

    for (let sq = 0; sq < 64; sq++) {
      const piece = board[sq];
      if (!piece) continue;

      const polyPiece = polyPieces[piece];
      key ^= BigInt(piecePolyKeys[polyPiece][sq]);
    }

    if (castling.K) key ^= BigInt(castlePolyKeys[0]);
    if (castling.Q) key ^= BigInt(castlePolyKeys[1]);
    if (castling.k) key ^= BigInt(castlePolyKeys[2]);
    if (castling.q) key ^= BigInt(castlePolyKeys[3]);

    if (this.hasPawnToCapture(board, epSquare, turn)) {
      const file = epSquare % 8;
      key ^= BigInt(enPassantPolyKeys[file]);
    }

    if (turn === "w") key ^= BigInt(sidePolyKey);

    return key;
  }

  /**
   * Decodes a raw polyglot 16-bit move into from/to/promotion + UCI string.
   * `fen`, if supplied, is used to translate the polyglot castling
   * encoding (king "captures" its own rook) into the standard king move.
   */
  decodeMove(move16, fen) {
    const toFile = move16 & 0x7;
    const toRank = (move16 >> 3) & 0x7;
    const fromFile = (move16 >> 6) & 0x7;
    const fromRank = (move16 >> 9) & 0x7;
    const promoBits = (move16 >> 12) & 0x7;

    const from = fromRank * 8 + fromFile;
    const to = toRank * 8 + toFile;

    const promoMap = { 0: null, 1: "n", 2: "b", 3: "r", 4: "q" };
    const promotion = promoMap[promoBits] || null;

    const fromName = squareName(from);
    let toName = squareName(to);

    if (fen) {
      const { board } = parseFen(fen);
      const fromPiece = board[from];

      if (fromPiece === "K" && fromName === "e1" && toName === "h1")
        toName = "g1";
      else if (fromPiece === "K" && fromName === "e1" && toName === "a1")
        toName = "c1";
      else if (fromPiece === "k" && fromName === "e8" && toName === "h8")
        toName = "g8";
      else if (fromPiece === "k" && fromName === "e8" && toName === "a8")
        toName = "c8";
    }

    const uci = `${fromName}${toName}${promotion || ""}`;

    return { from: fromName, to: toName, promotion, uci };
  }

  /**
   * Returns every book move for the given FEN, decoded, sorted by
   * weight descending (highest weight first).
   */
  getMoves(fen) {
    try {
      const key = this.getPolyKey(fen);
      const entries = this.positions.get(key) || [];

      return entries
        .map((e) => ({
          ...this.decodeMove(e.move, fen),
          weight: e.weight,
          learn: e.learn,
        }))
        .sort((a, b) => b.weight - a.weight);
    } catch (error) {
      console.error(error);
    }
  }

  hasBookMove(fen) {
    try {
      const key = this.getPolyKey(fen);
      return this.positions.has(key);
    } catch {
      return false;
    }
  }

  /**
   * Picks one move for the given FEN, weighted-random by book weight
   * (falls back to uniform random if all weights are 0). Returns null
   * if the position isn't in the book.
   */
  getMove(fen) {
    const moves = this.getMoves(fen);
    if (moves.length === 0) return null;

    const totalWeight = moves.reduce((sum, m) => sum + m.weight, 0);
    if (totalWeight === 0) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    let pick = Math.random() * totalWeight;
    for (const move of moves) {
      pick -= move.weight;
      if (pick < 0) return move;
    }

    return moves[0];
  }
}

module.exports = { PolyglotBook };
