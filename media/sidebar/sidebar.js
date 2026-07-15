// sidebar.js — runs inside the sidebar webview (separate context from the
// main chessboard webview). Only responsibility: collect the user's choice
// (fresh board / FEN / PGN) and hand it to the extension host. Actual game
// loading happens in index.js/dialog.js over in the main panel.

const vscode = acquireVsCodeApi();

// ── Tabs ─────────────────────────────────────────────────────────────────
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabBtns.forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    tabContents.forEach((c) => c.classList.remove("active"));

    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add("active");
  });
});

// ── New Game (fresh board) ─────────────────────────────────────────────
const newGameBtn = document.getElementById("sidebar-newgame-btn");
const newGameStatus = document.getElementById("sidebar-newgame-status");

newGameBtn.addEventListener("click", () => {
  newGameStatus.textContent = "";
  vscode.postMessage({ command: "newGame" });
});

// ── FEN ─────────────────────────────────────────────────────────────────
const fenInput = document.getElementById("sidebar-fen-input");
const fenLoadBtn = document.getElementById("sidebar-fen-load-btn");
const fenError = document.getElementById("sidebar-fen-error");

fenInput.addEventListener("input", () => {
  fenLoadBtn.disabled = !fenInput.value.trim();
  fenError.textContent = "";
});

fenInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    submitFen();
  }
});

fenLoadBtn.addEventListener("click", submitFen);

function submitFen() {
  const fen = fenInput.value.trim();
  if (!fen) {
    fenError.textContent = "Please enter a FEN.";
    return;
  }
  fenError.textContent = "";
  fenLoadBtn.disabled = true;
  vscode.postMessage({ command: "loadFen", fen });
}

// ── PGN ─────────────────────────────────────────────────────────────────
const pgnInput = document.getElementById("sidebar-pgn-input");
const fileInput = document.getElementById("sidebar-file-input");
const uploadBtn = document.getElementById("sidebar-upload-btn");
const pgnLoadBtn = document.getElementById("sidebar-pgn-load-btn");
const pgnError = document.getElementById("sidebar-pgn-error");

pgnInput.addEventListener("input", () => {
  pgnLoadBtn.disabled = !pgnInput.value.trim();
  pgnError.textContent = "";
});

uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  fileInput.value = "";
  if (!file) return;

  if (file.size === 0) {
    pgnError.textContent = "Error: File is empty (0 bytes). Please select a valid PGN file.";
    return;
  }

  const reader = new FileReader();

  reader.onload = (ev) => {
    pgnInput.value = ev.target.result;
    pgnLoadBtn.disabled = !pgnInput.value.trim();
    pgnError.textContent = "";
  };

  reader.onerror = () => {
    pgnError.textContent = "Error reading file: " + (reader.error?.message || "Unknown error");
  };

  reader.readAsText(file);
});

pgnLoadBtn.addEventListener("click", () => {
  const pgn = pgnInput.value.trim();
  if (!pgn) {
    pgnError.textContent = "Please enter or upload a PGN.";
    return;
  }
  pgnError.textContent = "";
  pgnLoadBtn.disabled = true;
  vscode.postMessage({ command: "loadPgn", pgn });
});

// ── Feedback from extension host ───────────────────────────────────────
window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg?.command !== "actionResult") return;

  if (msg.kind === "newGame") {
    newGameStatus.textContent = msg.success ? "" : msg.error || "Failed to start new game.";
  } else if (msg.kind === "fen") {
    fenLoadBtn.disabled = !fenInput.value.trim();
    fenError.textContent = msg.success ? "" : msg.error || "Failed to load FEN.";
  } else if (msg.kind === "pgn") {
    pgnLoadBtn.disabled = !pgnInput.value.trim();
    pgnError.textContent = msg.success ? "" : msg.error || "Failed to load game.";
  }
});