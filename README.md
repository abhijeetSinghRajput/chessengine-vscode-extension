# Chanakya (Chess Engine)

Play chess inside VS Code against **your own UCI engine**, running fully
local — no HTTP server, no API keys, no network calls.

Your engine binary (`chess.exe` or any UCI-compatible engine) is spawned
directly by the extension host and controlled over stdin/stdout, exactly the
way a GUI like Arena or Cute Chess talks to an engine.

## Features

- Drag-and-drop or click-to-move board, legal-move hints, check highlighting
- Full move history with branching + keyboard navigation (← → ↑ Home/End)
- FEN / PGN import and export
- Independent White-bot / Black-bot toggles — watch the engine play itself,
  or play against it as either color
- Per-side search-depth selector and live depth/nodes/time stats
- Board flip, sound effects, promotion picker

## Requirements

You need your own UCI-compatible chess engine executable. This extension
does not ship one. See **Setup** below.

## Getting started

1. Install the extension.
2. Copy your engine binary into the extension's `engine/` folder (see the
   Setup Guide for exact steps), **or** set `chanakya.enginePath` in
   Settings to point at it.
3. Open the Command Palette → **Chanakya: Open Chess Board**.
4. Toggle the bot switch on either player panel to have the engine play
   that side.

## Extension Settings

| Setting                        | Description                                              | Default |
|---------------------------------|------------------------------------------------------------|---------|
| `chanakya.enginePath`           | Absolute path to your engine executable                   | `""` (uses bundled `engine/chess.exe`) |
| `chanakya.defaultMovetimeMs`    | Default thinking time per move (ms)                        | `1000`  |
| `chanakya.defaultDepth`         | Fixed search depth (0 = use movetime instead)              | `0`     |
| `chanakya.maxEngineInstances`   | Warm engine processes kept in the pool                     | `2`     |

## Commands

- `Chanakya: Open Chess Board`
- `Chanakya: New Game`
- `Chanakya: Flip Board`

## Privacy

Nothing in this extension makes a network request. All engine communication
happens over local stdin/stdout between the extension host and your binary.

## License

MIT — see LICENSE.
