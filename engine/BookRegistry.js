/**
 * BookRegistry.js
 * ────────────────────────────────────────────────────────────────────────
 * Tracks Polyglot opening books (.bin) available to the extension:
 *   - one bundled "default" book shipped inside the extension (books/default.bin)
 *   - any number of user-added books, copied into global storage
 *
 * Mirrors EngineRegistry's shape so extension.js / dialog.js can treat
 * engines and books the same way (list / addFromPath / remove), plus a
 * resolvePath() used at move-request time to find the actual file.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STATE_KEY = "chanakya.books";
const LARGE_BOOK_WARNING_BYTES = 50 * 1024 * 1024; // 50MB

class BookRegistry {
  constructor(context) {
    this.context = context;

    const storageRoot =
      context.globalStorageUri?.fsPath ||
      context.globalStoragePath ||
      context.extensionPath;

    this.storageDir = path.join(storageRoot, "books");
    fs.mkdirSync(this.storageDir, { recursive: true });
  }

  list() {
    return this.context.globalState.get(STATE_KEY, []);
  }

  _save(entries) {
    return this.context.globalState.update(STATE_KEY, entries);
  }

  /** Validate a candidate .bin file before it's copied in. Throws on bad file. */
  async inspect(srcPath) {
    const stat = fs.statSync(srcPath);

    if (!stat.isFile()) {
      throw new Error(`Not a file: ${srcPath}`);
    }
    if (stat.size === 0) {
      throw new Error(`Book file is empty: ${srcPath}`);
    }
    if (stat.size % 16 !== 0) {
      throw new Error(
        `"${path.basename(srcPath)}" doesn't look like a valid Polyglot book ` +
          `(file size isn't a multiple of 16 bytes).`,
      );
    }

    return {
      size: stat.size,
      isLarge: stat.size > LARGE_BOOK_WARNING_BYTES,
    };
  }

  async addFromPath(srcPath) {
    await this.inspect(srcPath); // throws on invalid file, before copying

    const id = crypto.randomUUID();
    const fileName = `${id}${path.extname(srcPath) || ".bin"}`;
    const destPath = path.join(this.storageDir, fileName);

    fs.copyFileSync(srcPath, destPath);

    const entry = {
      id,
      name: path.basename(srcPath, path.extname(srcPath)),
      fileName,
      addedAt: Date.now(),
    };

    const entries = this.list();
    entries.push(entry);
    await this._save(entries);

    return entry;
  }

  async remove(id) {
    const entries = this.list();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;

    const filePath = path.join(this.storageDir, entry.fileName);
    fs.rm(filePath, { force: true }, () => {});

    await this._save(entries.filter((e) => e.id !== id));
  }

  /**
   * Resolves a bookId ("none" | "default" | <uuid>) to an absolute file
   * path. Returns null for "none" or an id that can't be resolved.
   */
  resolvePath(bookId, extensionPath) {
    if (!bookId || bookId === "none") return null;

    if (bookId === "default") {
      return path.join(extensionPath, "books", "performance.bin");
    }

    const entry = this.list().find((e) => e.id === bookId);
    if (!entry) return null;

    return path.join(this.storageDir, entry.fileName);
  }
}

module.exports = { BookRegistry, LARGE_BOOK_WARNING_BYTES };