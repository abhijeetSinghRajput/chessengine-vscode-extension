# Chanakya — Setup Guide

This zip is a complete, installable VS Code extension skeleton. It's
"production ready" in the sense that the code is real and works end-to-end —
but three things were **not included** because I don't have them: your piece
images, your sound effects, and your compiled `chess.exe`. You need to drop
those in before it does anything useful. Everything below tells you exactly
where.

## 1. Folder layout

```
chanakya-chess-engine/
├─ package.json          ← extension manifest (commands, settings)
├─ extension.js           ← host entry point (spawns engine, owns webview)
├─ icon.png                ← placeholder marketplace icon — replace it
├─ engine/
│   ├─ UCIEngine.js        ← spawns + talks UCI to one engine process
│   ├─ EnginePool.js       ← manages one engine per bot color
│   └─ chess.exe            ← ⚠️ YOU ADD THIS (see step 2)
└─ media/                  ← everything the webview loads
    ├─ index.html
    ├─ core/                ← your board UI, adapted (see "What changed")
    ├─ css/
    ├─ vendor/chess.esm.js  ← chess.js, vendored locally (no CDN)
    └─ assets/
        ├─ pieces/           ← ⚠️ YOU ADD 12 .webp FILES (step 3)
        └─ sounds/           ← ⚠️ YOU ADD 12 .mp3 FILES (step 3)
```

## 2. Add your engine binary

Copy your compiled engine into `engine/`:

- **Windows** → `engine/chess.exe`
- **macOS/Linux** → `engine/chess` (no extension), then:
  ```bash
  chmod +x engine/chess
  ```

The extension looks for the platform-appropriate name automatically. If you'd
rather keep the binary somewhere else (or ship a different engine per
machine), set it explicitly instead:

- Open VS Code Settings → search "Chanakya" → set **Engine Path** to the
  absolute path of your executable.

Your engine must speak standard UCI over stdin/stdout (`uci`, `isready`,
`ucinewgame`, `position fen ... moves ...`, `go movetime N` / `go depth N`,
and respond with `bestmove <uci-move>`). If your engine you mentioned
(~2250 ELO, bitboards, transposition table) already implements UCI — which
it sounds like it does, since your original backend wrapped it over UCI via
`child_process` — this will work without any engine-side changes.

**If you already have your own `UCIEngine.js` / `EnginePool.js`** from your
original `backend/src/` folder: you can replace the two files in `engine/`
with your own implementations. `extension.js` only calls:

```js
pool.requestMove(slot, { fen, moves, movetime, depth, wtime, btime, winc, binc })
pool.newGame()
pool.stopAll()
pool.disposeAll()
```

Keep that method surface and everything else (webview, UI) works unchanged.

## 3. Add your assets

Copy your existing files straight over — same names, same folders:

```
media/assets/pieces/  ←  wp.webp wr.webp wn.webp wb.webp wq.webp wk.webp
                          bp.webp br.webp bn.webp bb.webp bq.webp bk.webp

media/assets/sounds/  ←  capture.mp3 castle.mp3 game-end.mp3 game-start.mp3
                          illegal.mp3 move-check.mp3 move-opponent.mp3
                          move-self.mp3 notify.mp3 premove.mp3 promote.mp3
                          tenseconds.mp3
```

Delete the two `PLACE_..._HERE.txt` placeholder files once you've added the
real assets (they're harmless if left in, just clutter).

## 4. Replace the icon (optional but recommended)

`icon.png` at the project root is a generated placeholder (checkerboard +
"C" monogram). Replace it with a real 128×128 (or larger, square) PNG before
publishing. It's referenced from `package.json`'s `"icon"` field.

## 5. Run it locally (before packaging)

1. Open the `chanakya-chess-engine` folder in VS Code.
2. Press `F5` (or Run → Start Debugging). This launches an **Extension
   Development Host** window with your extension loaded.
3. In that new window: Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) →
   **Chanakya: Open Chess Board**.
4. Toggle the White or Black bot switch and confirm it plays a move.

If the engine can't be found, you'll get an error notification telling you
the exact path it looked for — that's your signal to double check step 2.

### Debugging the webview itself

If the board loads but looks broken (no pieces, no sounds), open the
Extension Development Host's Command Palette → **Developer: Open Webview
Developer Tools** to see console errors — almost always a missing asset
file from step 3.

## 6. Package it into a `.vsix`

```bash
cd chanakya-chess-engine
npm install -g @vscode/vsce      # one-time, if you don't have it
vsce package
```

This produces `chanakya-chess-engine-1.0.0.vsix`. Install it locally with:

```bash
code --install-extension chanakya-chess-engine-1.0.0.vsix
```

or via the Extensions panel → `...` menu → **Install from VSIX...**.

## 7. Publish to the Marketplace (optional)

1. Create a publisher at https://marketplace.visualstudio.com/manage —
   you already use `MRCodium` elsewhere, so `package.json`'s
   `"publisher": "MRCodium"` is set to match; change it if you want a
   different one.
2. Get a Personal Access Token from Azure DevOps (scoped to
   *Marketplace → Manage*).
3. `vsce login MRCodium`, then `vsce publish`.

## What changed from your original browser version, and why

Your original code called `fetch("http://localhost:3000/api/move")` against
an Express server that wrapped `chess.exe`. A VS Code **webview is a
sandboxed browser page** — it cannot make arbitrary network calls to
`localhost`, and it cannot `spawn()` a process. Only the **extension host**
(plain Node.js) can do that. So the boundary moved:

| Before                                   | Now                                              |
|-------------------------------------------|---------------------------------------------------|
| webview → `fetch()` → Express → `chess.exe` | webview → `postMessage()` → extension host → `chess.exe` |

Concretely, three files changed behavior (everything else — `board.js`,
`piece.js`, `history.js`, `marks.js`, `dialog.js`, `ui.js`, `fen.js`, CSS —
is copied over unchanged):

- **`media/core/engine.js`** — `fetchMove()` now sends a `postMessage` to
  the extension host and resolves when the matching response arrives,
  instead of doing an HTTP `fetch`.
- **`media/core/bot.js`** — passes `this.color` as an engine-pool "slot" key
  instead of an HTTP endpoint URL (unused now, kept as a no-op parameter for
  signature compatibility).
- **`extension.js`** *(new)* — owns the webview panel, converts local file
  paths to `webview.asWebviewUri()`, and answers `getMove` messages by
  calling into `engine/EnginePool.js`, which spawns and talks to
  `chess.exe` over stdin/stdout via `engine/UCIEngine.js`.

Two smaller adaptations, both forced by the webview sandbox:

- **`chess.js` is now vendored** (`media/vendor/chess.esm.js`) instead of
  imported from a CDN (`cdn.jsdelivr.net`) — webview Content-Security-Policy
  blocks remote script/module loads by default, and you don't want a chess
  extension silently depending on network access anyway.
- **Asset paths became relative** (`assets/pieces/wp.webp` instead of
  `/assets/pieces/wp.webp`) so they resolve against the `<base>` tag
  `extension.js` injects, which points at the webview's virtual resource
  root — absolute `/...` paths don't mean "extension root" the way they do
  in a normal web server.

## Known limitations to be aware of

- **Desktop only.** This uses Node's `child_process`, so it works in the
  desktop VS Code app (Windows/macOS/Linux) but **not** in vscode.dev or
  other web-based VS Code. If you only ever use desktop VS Code, ignore this.
- **One engine binary per platform.** If you want the extension to work on
  Windows *and* macOS/Linux from the same install, you'll need to ship both
  binaries and the platform-detection code in `extension.js` already picks
  the right filename — you just need both files present, or a compile step
  per platform.
- **`EnginePool.disposeAll()` runs on deactivate**, but if VS Code is force-
  killed the engine child process can occasionally be left running. Not
  something you need to fix — just know `chess.exe` processes may
  occasionally need a manual cleanup during heavy dev/debug cycles.

## Quick checklist before you call it done

- [ ] `engine/chess.exe` (or `chess` + executable bit) added
- [ ] 12 piece `.webp` files added to `media/assets/pieces/`
- [ ] 12 sound `.mp3` files added to `media/assets/sounds/`
- [ ] `icon.png` replaced with a real icon (optional)
- [ ] `F5` launch works, board renders, bot toggle produces a move
- [ ] `vsce package` succeeds and the `.vsix` installs cleanly
