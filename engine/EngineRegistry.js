/**
 * EngineRegistry.js
 * ────────────────────────────────────────────────────────────────────────
 * Manages user-added UCI engines.
 *
 * - Validates a candidate .exe actually speaks UCI before touching disk.
 * - Copies the validated executable into the extension's global storage
 *   directory — we never persist or depend on the user's original path
 *   (it could move, be on a removable drive, get deleted, etc).
 * - Persists {id, name, fileName} metadata in context.globalState.
 * - Resolves an engineId ("builtin" or a custom id) to an absolute path.
 */

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const STORAGE_KEY = "chanakya.customEngines";

class EngineRegistry {
  constructor(context) {
    this.context = context;
    this.enginesDir = path.join(context.globalStorageUri.fsPath, "engines");
  }

  async _ensureDir() {
    await fs.promises.mkdir(this.enginesDir, { recursive: true });
  }

  /** All registered custom engines: [{ id, name, fileName }] */
  list() {
    return this.context.globalState.get(STORAGE_KEY, []);
  }

  /** Resolve an engineId to an absolute executable path. */
  resolvePath(engineId, extensionPath) {
    if (!engineId || engineId === "builtin") {
      const override = vscode.workspace
        .getConfiguration("chanakya")
        .get("enginePath", "")
        .trim();
      if (override) return override;

      const platformExe = process.platform === "win32" ? "chess.exe" : "chess";
      return path.join(extensionPath, "engine", platformExe);
    }

    const entry = this.list().find((e) => e.id === engineId);
    if (!entry) {
      throw new Error(
        `Engine "${engineId}" is no longer registered — pick another engine in Settings.`,
      );
    }
    return path.join(this.enginesDir, entry.fileName);
  }

  /**
   * Validate a candidate exe speaks UCI, then copy it into storage and
   * register it. Throws if it doesn't respond correctly — caller should
   * show that message to the user and NOT add anything to the dropdown.
   */
  async addFromPath(srcPath) {
    const info = await this._validateUci(srcPath);
    if (!info.ok) {
      throw new Error(
        "That file didn't respond to the UCI 'uci' command within 3s — is it a UCI-compatible engine?",
      );
    }

    await this._ensureDir();

    const displayName =
      info.name || path.basename(srcPath, path.extname(srcPath));
    const id = `custom-${Date.now()}`;
    const ext = path.extname(srcPath);
    const fileName = `${id}${ext}`;
    const destPath = path.join(this.enginesDir, fileName);

    await fs.promises.copyFile(srcPath, destPath);
    if (process.platform !== "win32") {
      await fs.promises.chmod(destPath, 0o755);
    }

    const entry = { id, name: displayName, fileName };
    const engines = this.list();
    engines.push(entry);
    await this.context.globalState.update(STORAGE_KEY, engines);

    return entry;
  }

  /** Remove a custom engine's copy + metadata. No-op for "builtin". */
  async remove(engineId) {
    if (!engineId || engineId === "builtin") return;

    const engines = this.list();
    const entry = engines.find((e) => e.id === engineId);
    if (!entry) return;

    await fs.promises
      .unlink(path.join(this.enginesDir, entry.fileName))
      .catch(() => {});

    await this.context.globalState.update(
      STORAGE_KEY,
      engines.filter((e) => e.id !== engineId),
    );
  }

  /**
   * Spawn the candidate, send "uci", and wait for "uciok" within a
   * timeout. Captures "id name" along the way for the display label.
   * Resolves { ok: boolean, name: string|null } — never rejects.
   */
  _validateUci(exePath, timeoutMs = 3000) {
    return new Promise((resolve) => {
      let settled = false;
      let proc;

      try {
        proc = spawn(exePath);
      } catch {
        resolve({ ok: false, name: null });
        return;
      }

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          proc.kill();
        } catch {}
        resolve(result);
      };

      const timer = setTimeout(() => finish({ ok: false, name: null }), timeoutMs);

      let name = null;
      let buffer = "";

      proc.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep any partial last line for next chunk

        for (const raw of lines) {
          const line = raw.trim();
          if (line.startsWith("id name")) {
            name = line.slice("id name".length).trim();
          }
          if (line === "uciok") {
            finish({ ok: true, name });
            return;
          }
        }
      });

      proc.on("error", () => finish({ ok: false, name: null }));
      proc.stdin.write("uci\n");
    });
  }
}

module.exports = { EngineRegistry };