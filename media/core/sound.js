// sound.js
// Play sounds based on move flags and game state.
// chess.js move.flags: 'n'=normal, 'b'=pawn double, 'e'=en passant,
//                      'c'=capture, 'k'=kingside castle, 'q'=queenside castle,
//                      'p'=promotion

const cache = {};
let soundEnabled = true;

export function initSound() {
  const button = document.querySelector("#sound-toggle");

  soundEnabled = JSON.parse(
    localStorage.getItem("chanakya-sound") ?? "true"
  );

  button?.classList.toggle("off", !soundEnabled);

  button?.addEventListener("click", () => {
    soundEnabled = !soundEnabled;

    button.classList.toggle("off", !soundEnabled);

    localStorage.setItem(
      "chanakya-sound",
      JSON.stringify(soundEnabled)
    );
  });
}

const load = (name) => {
  if (!cache[name]) {
    // NOTE: relative path (no leading "/") so it resolves against the
    // <base href="__BASE_URI__/"> tag injected by extension.js.
    const audio = new Audio(`assets/sounds/${name}.mp3`);
    audio.preload = "auto";
    cache[name] = audio;
  }
  return cache[name];
};

export const play = (name) => {
  const audio = load(name);
  audio.currentTime = 0;
  audio.play().catch(() => {}); // ignore autoplay policy errors
};

// Preload all sounds up front
const ALL = [
  "capture","castle","game-end","game-start",
  "illegal","move-check","move-opponent","move-self",
  "notify","premove","promote","tenseconds",
];
ALL.forEach(load);

/**
 * Pick and play the right sound for a completed move.
 * @param {object} move  - chess.js move object
 * @param {object} game  - Chess instance (to check isCheck, isGameOver)
 * @param {string} side  - 'w' | 'b'  (side that just moved)
 */
export const playMoveSound = (move, game, side) => {
  if (!soundEnabled) return;

  if (move.flags.includes("p")) {
    play("promote");
    return;
  }
  if (move.flags.includes("k") || move.flags.includes("q")) {
    play("castle");
    return;
  }
  if (move.flags.includes("c") || move.flags.includes("e")) {
    play("capture");
    return;
  }
  if (game.inCheck()) {
    play("move-check");
    return;
  }
  play("move-self");
};

export const playIllegal        = () => soundEnabled && play("illegal");
export const playGameStartSound = () => soundEnabled && play("game-start");
export const playGameEndSound   = () => soundEnabled && play("game-end");
export const playCheckSount     = () => soundEnabled && play("move-check");
