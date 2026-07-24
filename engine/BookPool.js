/**
 * BookPool.js
 * ────────────────────────────────────────────────────────────────────────
 * Loads each opening book (.bin) once and caches the parsed PolyglotBook
 * instance by absolute file path. Mirrors EnginePool's per-slot caching,
 * but keyed by book path rather than a spawned process — a book has
 * nothing to "quit", only to reparse if the underlying file changes.
 */

const { PolyglotBook } = require("./polyglotBook");

class BookPool {
  constructor() {
    this.books = new Map(); // path -> PolyglotBook
  }

  /** Load (or return the cached) PolyglotBook for an absolute path. */
  _getBook(bookPath) {
    let book = this.books.get(bookPath);
    if (!book) {
      book = new PolyglotBook();
      book.load(bookPath);
      this.books.set(bookPath, book);
    }
    return book;
  }

  /**
   * Probe a book for a move at the given FEN.
   * @param {string} bookPath - absolute path to the .bin file, or falsy
   * @param {string} fen - the CURRENT position (after replaying moves)
   * @returns {{uci:string, from:string, to:string, promotion:string|null, weight:number, learn:number}|null}
   */
  probe(bookPath, fen) {
    if (!bookPath) return null;
    const book = this._getBook(bookPath);
    return book.getMove(fen);
  }

  hasBookMove(bookPath, fen) {
    if (!bookPath) return false;
    const has = this._getBook(bookPath).hasBookMove(fen);
    console.log("hasBookMove", has);
    return has;
  }

  /** Drop a cached parse (e.g. after the book file is deleted/replaced). */
  invalidate(bookPath) {
    this.books.delete(bookPath);
  }

  clear() {
    this.books.clear();
  }
}

module.exports = { BookPool };
