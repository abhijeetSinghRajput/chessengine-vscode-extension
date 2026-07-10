/**
 * extension.js
 * ────────────────────────────────────────────────────────────────────────
 * Chanakya (Chess Engine) — VS Code extension entry point.
 *
 * Owns:
 *   - the webview panel lifecycle (chess board UI lives in /media)
 *   - the EnginePool (spawns ./engine/chess.exe, or a user-configured path)
 *   - the postMessage bridge between the webview and the local engine
 *
 * No network calls, no HTTP server — the webview talks to this file via
 * vscode.postMessage(), and this file talks to chess.exe over stdin/stdout.
 */

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { EnginePool } = require("./engine/EnginePool");

let pool = null;
let panel = null;

function activate(context) {
  const openBoard = vscode.commands.registerCommand("chanakya.openBoard", () => {
    createOrRevealPanel(context);
  });

  context.subscriptions.push(openBoard);
}

function deactivate() {
  pool?.disposeAll();
  pool = null;
}

// ── Panel setup ─────────────────────────────────────────────────────────

function createOrRevealPanel(context) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    return;
  }

  const mediaRoot = vscode.Uri.file(path.join(context.extensionPath, "media"));

  panel = vscode.window.createWebviewPanel(
    "chanakyaBoard",
    "Chanakya — Chess",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [mediaRoot],
    }
  );

  panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, "icon.svg"));
  panel.webview.html = getHtml(panel.webview, context.extensionPath);

  panel.webview.onDidReceiveMessage((msg) => handleMessage(msg, panel, context));

  panel.onDidDispose(() => {
    panel = null;
    pool?.stopAll();
  });
}

// ── HTML ────────────────────────────────────────────────────────────────

function getHtml(webview, extensionPath) {
  const mediaPath = path.join(extensionPath, "media");
  const htmlPath = path.join(mediaPath, "index.html");
  let html = fs.readFileSync(htmlPath, "utf8");

  const baseUri = webview.asWebviewUri(vscode.Uri.file(mediaPath)).toString();
  const nonce = getNonce();

  html = html
    .replace(/__BASE_URI__/g, baseUri)
    .replace(/__CSP_SOURCE__/g, webview.cspSource)
    .replace(/__NONCE__/g, nonce);

  return html;
}

function getNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

// ── Engine bridge ───────────────────────────────────────────────────────

function resolveEnginePath(extensionPath) {
  const configured = vscode.workspace.getConfiguration("chanakya").get("enginePath", "").trim();
  if (configured) return configured;

  const platformExe = process.platform === "win32" ? "chess.exe" : "chess";
  return path.join(extensionPath, "engine", platformExe);
}

function ensurePool(context) {
  if (pool) return pool;

  const enginePath = resolveEnginePath(context.extensionPath);

  if (!fs.existsSync(enginePath)) {
    vscode.window.showErrorMessage(
      `Chanakya: engine executable not found at "${enginePath}". ` +
        `Set "chanakya.enginePath" in Settings, or place your engine at extension/engine/${
          process.platform === "win32" ? "chess.exe" : "chess"
        }.`
    );
    throw new Error("Engine executable not found: " + enginePath);
  }

  const maxInstances = vscode.workspace.getConfiguration("chanakya").get("maxEngineInstances", 2);
  pool = new EnginePool(enginePath, maxInstances);
  return pool;
}

async function handleMessage(msg, panel, context) {
  if (!msg || typeof msg !== "object") return;

  switch (msg.command) {
    case "getMove": {
      const { id, payload, slot } = msg;
      try {
        const enginePool = ensurePool(context);
        const cfg = vscode.workspace.getConfiguration("chanakya");
        const defaults = {
          movetime: payload.movetime ?? cfg.get("defaultMovetimeMs", 1000),
          depth: payload.depth ?? cfg.get("defaultDepth", 0),
        };
        const result = await enginePool.requestMove(slot || "default", { ...payload, ...defaults });
        panel.webview.postMessage({ command: "bestMove", id, data: result });
      } catch (err) {
        panel.webview.postMessage({ command: "engineError", id, error: err.message });
      }
      break;
    }

    case "newGame": {
      try {
        const enginePool = ensurePool(context);
        await enginePool.newGame();
      } catch (err) {
        vscode.window.showErrorMessage(`Chanakya: ${err.message}`);
      }
      break;
    }

    case "stopSearch": {
      pool?.stopAll();
      break;
    }

    case "log": {
      console.log("[Chanakya webview]", msg.data);
      break;
    }

    default:
      break;
  }
}

module.exports = { activate, deactivate };
