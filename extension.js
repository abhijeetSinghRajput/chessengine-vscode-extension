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
const { SidebarProvider } = require("./sidebarProvider");
const { HistoryStore } = require("./historyStore");
const { EnginePool } = require("./engine/EnginePool");
const { EngineRegistry } = require("./engine/EngineRegistry");
const {
  BookRegistry,
  LARGE_BOOK_WARNING_BYTES,
} = require("./engine/BookRegistry");
const { currentFenFromPayload } = require("./engine/fen");
const { BookPool } = require("./engine/BookPool");

let pool = null;
let panel = null;
let panelReady = false;
let pendingAction = null; // { command, action, fen?, pgn? } — flushed once panelReady
let sidebarProvider = null;
let historyStore = null;
let engineRegistry = null;
let bookRegistry = null;
let bookPool = null;

function activate(context) {
  historyStore = new HistoryStore(context.globalState);
  engineRegistry = new EngineRegistry(context);
  bookRegistry = new BookRegistry(context);
  bookPool = new BookPool();

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

function resolveEnginePathForSlot(slot, context) {
  const engineId = context.globalState.get(
    `chanakya.selectedEngine.${slot}`,
    "builtin",
  );
  const enginePath = engineRegistry.resolvePath(
    engineId,
    context.extensionPath,
  );

  if (!fs.existsSync(enginePath)) {
    throw new Error(
      `Engine executable not found at "${enginePath}". ` +
        `Pick a different engine in Settings, or reinstall it via "Add UCI Engine".`,
    );
  }
  return enginePath;
}

function ensurePool(context) {
  if (pool) return pool;
  const maxInstances = vscode.workspace
    .getConfiguration("chanakya")
    .get("maxEngineInstances", 2);
  pool = new EnginePool(
    (slot) => resolveEnginePathForSlot(slot, context),
    maxInstances,
  );
  return pool;
}

async function handleMessage(msg, panel, context) {
  if (!msg || typeof msg !== "object") return;

  switch (msg.command) {
    case "getMove": {
      const { id, payload, slot } = msg;
      const side = slot === "b" ? "b" : "w"; // slot is the bot's color ("w"/"b")

      try {
        // ── Book probe ──────────────────────────────────────────────────
        const bookId = context.globalState.get(
          `chanakya.selectedBook.${side}`,
          "default",
        );
        const bookPath = bookRegistry.resolvePath(
          bookId,
          context.extensionPath,
        );

        if (bookPath && fs.existsSync(bookPath)) {
          const currentFen = currentFenFromPayload(payload.fen, payload.moves);
          const bookMove = bookPool.probe(bookPath, currentFen);

          if (bookMove) {
            panel.webview.postMessage({
              command: "bestMove",
              id,
              data: {
                bestMove: bookMove.uci,
                depth: 0,
                time: 0,
                nodes: 0,
                source: "book",
              },
            });
            break;
          }
        }

        // ── Engine fallback ─────────────────────────────────────────────
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
        panel.webview.postMessage({
          command: "bestMove",
          id,
          data: { ...result, source: "engine" },
        });
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
        "Delete",
      );

      if (choice === "Delete") {
        historyStore.clearHistory();

        sidebarProvider?.postHistory(historyStore.getSidebarData());
      }

      break;
    }

    case "addUciEngine": {
      try {
        const uri = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters:
            process.platform === "win32" ? { Executable: ["exe"] } : undefined,
          title: "Select UCI engine executable",
        });
        if (!uri?.[0]) break;

        const entry = await engineRegistry.addFromPath(uri[0].fsPath);
        panel.webview.postMessage({
          command: "engineListUpdated",
          engines: engineRegistry.list(),
          added: entry,
        });
      } catch (err) {
        vscode.window.showErrorMessage(`Chanakya: ${err.message}`);
        panel.webview.postMessage({
          command: "engineAddFailed",
          error: err.message,
        });
      }
      break;
    }

    case "selectEngine": {
      const { side, engineId } = msg; // side: "w" | "b"
      await context.globalState.update(
        `chanakya.selectedEngine.${side}`,
        engineId,
      );
      break;
    }

    case "requestEngineList": {
      panel.webview.postMessage({
        command: "engineListUpdated",
        engines: engineRegistry.list(),
        selected: {
          w: context.globalState.get("chanakya.selectedEngine.w", "builtin"),
          b: context.globalState.get("chanakya.selectedEngine.b", "builtin"),
        },
      });
      break;
    }

    case "addBook": {
      try {
        const uri = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { "Polyglot Book": ["bin"] },
          title: "Select opening book (.bin)",
        });
        if (!uri?.[0]) break;

        const srcPath = uri[0].fsPath;
        const info = await bookRegistry.inspect(srcPath); // throws on bad file, BEFORE copying

        if (info.isLarge) {
          const mb = (info.size / (1024 * 1024)).toFixed(0);
          const choice = await vscode.window.showWarningMessage(
            `This book is ${mb}MB. It'll be copied into extension storage. Continue?`,
            { modal: true },
            "Add Book",
          );
          if (choice !== "Add Book") break;
        }

        const entry = await bookRegistry.addFromPath(srcPath);
        panel.webview.postMessage({
          command: "bookListUpdated",
          books: bookRegistry.list(),
          added: entry,
        });
      } catch (err) {
        vscode.window.showErrorMessage(`Chanakya: ${err.message}`);
        panel.webview.postMessage({
          command: "bookAddFailed",
          error: err.message,
        });
      }
      break;
    }

    case "deleteBook": {
      const { bookId, bookName } = msg;
      const choice = await vscode.window.showWarningMessage(
        `Delete book "${bookName}"? This can't be undone.`,
        { modal: true },
        "Delete",
      );
      if (choice === "Delete") {
        await bookRegistry.remove(bookId);
        panel.webview.postMessage({
          command: "bookListUpdated",
          books: bookRegistry.list(),
        });
      }
      break;
    }

    case "deleteEngine": {
      const { engineId, engineName } = msg;
      const choice = await vscode.window.showWarningMessage(
        `Delete engine "${engineName}"? This can't be undone.`,
        { modal: true },
        "Delete",
      );
      if (choice === "Delete") {
        await engineRegistry.remove(engineId);
        panel.webview.postMessage({
          command: "engineListUpdated",
          engines: engineRegistry.list(),
          selected: {
            w: context.globalState.get("chanakya.selectedEngine.w", "builtin"),
            b: context.globalState.get("chanakya.selectedEngine.b", "builtin"),
          },
        });
      }
      break;
    }

    case "selectBook": {
      const { side, bookId } = msg; // side: "w" | "b"
      await context.globalState.update(`chanakya.selectedBook.${side}`, bookId);
      break;
    }

    case "requestBookList": {
      panel.webview.postMessage({
        command: "bookListUpdated",
        books: bookRegistry.list(),
        selected: {
          w: context.globalState.get("chanakya.selectedBook.w", "default"),
          b: context.globalState.get("chanakya.selectedBook.b", "default"),
        },
      });
      break;
    }

    case "hasBookMove": {
      const { fen, side, to } = msg;

      const bookId = context.globalState.get(
        `chanakya.selectedBook.${side}`,
        "default",
      );

      const bookPath = bookRegistry.resolvePath(bookId, context.extensionPath);

      const hasBookMove =
        bookPath && fs.existsSync(bookPath)
          ? bookPool.hasBookMove(bookPath, fen)
          : false;

      panel.webview.postMessage({
        command: "hasBookMoveResult",
        hasBookMove,
        to,
      });

      break;
    }

    default:
      break;
  }
}

module.exports = { activate, deactivate };
