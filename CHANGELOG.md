# Changelog

## 1.0.0

- Initial release.
- Local UCI engine support via `child_process` (no HTTP server, no API calls).
- Engine pool with independent White/Black bot slots so both sides can think
  without blocking each other.cg
- Full board UI: drag & drop, click-to-move, promotion picker, move history
  with branching/navigation, FEN/PGN import & export, board flip, check
  highlighting, move/capture/castle/promote sound effects.
- Commands: `Chess: Open Chess Board`, `Chanakya: New Game`,
  `Chanakya: Flip Board`.
- Settings: `chanakya.enginePath`, `chanakya.defaultMovetimeMs`,
  `chanakya.defaultDepth`, `chanakya.maxEngineInstances`.
