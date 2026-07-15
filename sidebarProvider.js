/**
 * sidebarProvider.js — Activity Bar sidebar webview (New Game / History).
 *
 * This is a *separate* webview from the main chessboard panel. It only
 * knows how to render its tabs and forward a chosen action (fresh board /
 * FEN / PGN) up to whoever owns it (extension.js), via the onNewGame /
 * onLoadFen / onLoadPgn callbacks. It never talks to `game`/`ChessUI`
 * directly.
 */

const vscode = require("vscode");
const fs = require("fs");

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

class SidebarProvider {
  static viewType = "chanakya.sidebarView";

  constructor(extensionUri) {
    this._extensionUri = extensionUri;
    this._view = null;

    // Set these from extension.js:
    this.onNewGame = null; // () => void
    this.onLoadFen = null; // (fen: string) => void
    this.onLoadPgn = null; // (pgn: string) => void
  }

  /** @param {vscode.WebviewView} webviewView */
  resolveWebviewView(webviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "media", "sidebar"),
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (!msg) return;

      switch (msg.command) {
        case "newGame":
          if (typeof this.onNewGame === "function") {
            this.onNewGame();
          } else {
            this.postResult("newGame", false, "Not ready yet.");
          }
          break;

        case "loadFen":
          if (typeof this.onLoadFen === "function") {
            this.onLoadFen(msg.fen);
          } else {
            this.postResult("fen", false, "Not ready yet.");
          }
          break;

        case "loadPgn":
          if (typeof this.onLoadPgn === "function") {
            this.onLoadPgn(msg.pgn);
          } else {
            this.postResult("pgn", false, "Not ready yet.");
          }
          break;
      }
    });
  }

  /** Give the sidebar UI feedback on an action.
   *  kind: "newGame" | "fen" | "pgn" — matches which section's status/error
   *  text should be updated. */
  postResult(kind, success, error) {
    this._view?.webview.postMessage({
      command: "actionResult",
      kind,
      success,
      error,
    });
  }

  _getHtml(webview) {
    const nonce = getNonce();

    const htmlPath = vscode.Uri.joinPath(
      this._extensionUri, "media", "sidebar", "sidebar.html",
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "sidebar", "sidebar.css"),
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "sidebar", "sidebar.js"),
    );

    let html = fs.readFileSync(htmlPath.fsPath, "utf-8");

    html = html
      .replace(/{{cspSource}}/g, webview.cspSource)
      .replace(/{{nonce}}/g, nonce)
      .replace(/{{cssUri}}/g, cssUri.toString())
      .replace(/{{jsUri}}/g, jsUri.toString());

    return html;
  }
}

module.exports = { SidebarProvider };