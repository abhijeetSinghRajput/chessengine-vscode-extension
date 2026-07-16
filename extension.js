/**
 * extension.js
 * ────────────────────────────────────────────────────────────────────────
 * Chanakya (Chess Engine) — VS Code extension entry point.
 *
 * Owns:
 *   - the webview panel lifecycle (chess board UI lives in /media)
 *   - the EnginePool (spawns ./engine/chess.exe, or a user-configured path)
 *   - the postMessage bridge between the webview and the local engine
 *   - the Activity Bar sidebar (New Game / History) and its bridge to the
 *     board panel above
 *
 * No network calls, no HTTP server — the webview talks to this file via
 * vscode.postMessage(), and this file talks to chess.exe over stdin/stdout.
 */

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { EnginePool } = require("./engine/EnginePool");
const { SidebarProvider } = require("./sidebarProvider");
const { HistoryStore } = require("./historyStore");

let pool = null;
let panel = null;
let panelReady = false;
let pendingAction = null; // { command, action, fen?, pgn? } — flushed once panelReady
let sidebarProvider = null;
let historyStore = null;

function activate(context) {
  historyStore = new HistoryStore(context.globalState);

  const openBoard = vscode.commands.registerCommand("chess.openBoard", () => {
    createOrRevealPanel(context);
  });

  context.subscriptions.push(openBoard);

  // ── Sidebar (New Game / History) ─────────────────────────────────────
  sidebarProvider = new SidebarProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      sidebarProvider,
    ),
  );

  // Sidebar → host: forward the chosen action into the board panel,
  // auto-opening it if it isn't already open (and queueing the action
  // until the panel signals it's actually ready to receive messages —
  // see the "ready" case in handleMessage).
  sidebarProvider.onNewGame = () => {
    dispatchToBoard({ command: "uiCommand", action: "newGame" }, context);
    // ui.resetGame() in the webview doesn't currently report back, so we
    // report success optimistically once the message has been dispatched.
    sidebarProvider.postResult("newGame", true);
  };

  sidebarProvider.onLoadFen = (fen) => {
    dispatchToBoard({ command: "uiCommand", action: "loadFen", fen }, context);
  };

  sidebarProvider.onLoadPgn = (pgn) => {
    historyStore.setCurrentGame(pgn);

    sidebarProvider.postHistory(historyStore.getSidebarData());

    dispatchToBoard(
      {
        command: "uiCommand",
        action: "loadPgn",
        pgn,
      },
      context,
    );
  };

  sidebarProvider.onMessage = (msg) => {
    handleMessage(msg, panel, context);
  };
}

/** Send a uiCommand message to the board panel, opening it first if
 *  necessary and queueing the message if the panel hasn't signalled
 *  "ready" yet. Only the most recent pending action is kept — if the
 *  user fires two actions before the panel loads, the second wins. */
function dispatchToBoard(msg, context) {
  if (!panel) {
    createOrRevealPanel(context);
  } else {
    panel.reveal(vscode.ViewColumn.One);
  }

  if (panelReady) {
    panel.webview.postMessage(msg);
  } else {
    pendingAction = msg;
  }
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
    "Chess",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [mediaRoot],
    },
  );

  panel.iconPath = vscode.Uri.file(
    path.join(context.extensionPath, "icon.svg"),
  );
  panel.webview.html = getHtml(panel.webview, context.extensionPath);

  panel.webview.onDidReceiveMessage((msg) =>
    handleMessage(msg, panel, context),
  );

  panel.onDidDispose(() => {
    panel = null;
    panelReady = false;
    pendingAction = null;
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
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++)
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

// ── Engine bridge ───────────────────────────────────────────────────────

function resolveEnginePath(extensionPath) {
  const configured = vscode.workspace
    .getConfiguration("chanakya")
    .get("enginePath", "")
    .trim();
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
        }.`,
    );
    throw new Error("Engine executable not found: " + enginePath);
  }

  const maxInstances = vscode.workspace
    .getConfiguration("chanakya")
    .get("maxEngineInstances", 2);
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
        const result = await enginePool.requestMove(slot || "default", {
          ...payload,
          ...defaults,
        });
        panel.webview.postMessage({ command: "bestMove", id, data: result });
      } catch (err) {
        panel.webview.postMessage({
          command: "engineError",
          id,
          error: err.message,
        });
      }
      break;
    }

    // Webview → host: signals index.js has loaded and attached its
    // message listener. Flush anything queued while it was still loading.
    case "ready": {
      panelReady = true;
      if (pendingAction) {
        panel.webview.postMessage(pendingAction);
        pendingAction = null;
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

    // Board panel → host: result of an action requested by the sidebar.
    // Relay it back so the sidebar can clear/show the right section's
    // error text.
    case "loadFenResult": {
      sidebarProvider?.postResult("fen", msg.success, msg.error);
      break;
    }

    case "loadPgnResult": {
      sidebarProvider?.postResult("pgn", msg.success, msg.error);
      break;
    }

    case "saveCurrentGame": {
      historyStore.setCurrentGame(msg.pgn);
      sidebarProvider?.postHistory(historyStore.getSidebarData());
      break;
    }

    case "commitGameToHistory": {
      historyStore.commitToHistory(msg.pgn);

      sidebarProvider?.postHistory(historyStore.getSidebarData());

      break;
    }

    case "log": {
      console.log("[Chanakya webview]", msg.data);
      break;
    }

    case "requestHistory": {
      sidebarProvider?.postHistory(historyStore.getSidebarData());
      break;
    }

    case "deleteHistory": {
      historyStore.removeHistory(msg.id);

      sidebarProvider?.postHistory(historyStore.getSidebarData());

      break;
    }

    case "loadHistory": {
      dispatchToBoard(
        {
          command: "uiCommand",
          action: "loadPgn",
          pgn: msg.pgn,
        },
        context,
      );
      break;
    }

    case "confirmClearHistory": {
      const choice = await vscode.window.showWarningMessage(
        "Delete all saved games?",
        { modal: true },
        "Delete"
      );

      if (choice === "Delete") {
        historyStore.clearHistory();

        sidebarProvider?.postHistory(
          historyStore.getSidebarData()
        );
      }

      break;
    }

    default:
      break;
  }
}

module.exports = { activate, deactivate };

