// sidebar.js — runs inside the sidebar webview (separate context from the
// main chessboard webview). Only responsibility: collect the user's choice
// (fresh board / FEN / PGN) and hand it to the extension host. Actual game
// loading happens in index.js/dialog.js over in the main panel.

const vscode = acquireVsCodeApi();

// ── Tabs ─────────────────────────────────────────────────────────────────
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const historyList = document.getElementById("history-list");

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


// ── History actions ───────────────────────────────────────────────

const refreshHistoryBtn = document.getElementById("refresh-history-btn");
const clearHistoryBtn = document.getElementById("clear-history-btn");

refreshHistoryBtn?.addEventListener("click", () => {
  vscode.postMessage({
    command: "requestHistory",
  });
});

clearHistoryBtn?.addEventListener("click", () => {
  vscode.postMessage({
    command: "confirmClearHistory",
  });
});

function renderHistory(data) {
  historyList.innerHTML = "";

  if (!data.current && data.history.length === 0) {
    historyList.innerHTML = `
      <div class="history-empty">
        <div class="history-empty-icon">♟</div>

        <div class="history-empty-title">
          No games saved yet
        </div>

        <div class="history-empty-hint">
          Games are automatically saved when they end
        </div>
      </div>
    `;

    return;
  }


  if (data.current) {
    historyList.appendChild(
      createCard({
        date: "●",
        pgn: data.current.pgn,
        current: true,
      }),
    );
  }

  for (let i = 0; i < data.history.length; ++i) {
    const game = data.history[i];

    try {
      historyList.appendChild(
        createCard({
          date: formatDate(game.savedAt),
          pgn: game.pgn,
          current: false,
          id: game.id,
        }),
      );
    } catch (error) {
      console.log(error);
    }
  }
}

function formatDate(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  const units = [
    { limit: 30, text: "just now" },

    { limit: 60 * 60, size: 60, label: "min" },

    { limit: 60 * 60 * 24, size: 60 * 60, label: "hr" },

    { limit: 60 * 60 * 24 * 7, size: 60 * 60 * 24, label: "day" },

    { limit: 60 * 60 * 24 * 30, size: 60 * 60 * 24 * 7, label: "week" },

    { limit: 60 * 60 * 24 * 365, size: 60 * 60 * 24 * 30, label: "month" },

    { limit: Infinity, size: 60 * 60 * 24 * 365, label: "year" },
  ];

  for (const unit of units) {
    if (seconds < unit.limit) {
      if (unit.text) {
        return unit.text;
      }

      const value = Math.floor(seconds / unit.size);

      return `${value} ${unit.label}${value > 1 ? "s" : ""} ago`;
    }
  }
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function getGameMeta(pgn, current = false) {
  const resultMatch = pgn.match(/\[Result\s+"([^"]+)"\]/);
  const whiteMatch = pgn.match(/\[White\s+"([^"]+)"\]/);
  const blackMatch = pgn.match(/\[Black\s+"([^"]+)"\]/);

  const white = whiteMatch?.[1] || "White";
  const black = blackMatch?.[1] || "black";
  
  const result = resultMatch?.[1];
  
  let winner = "?";
  let winnerColor = "";
  let crown = false;

  switch (result) {
    case "1-0":
      winner = white;
      winnerColor = "white";
      crown = true;
      break;

    case "0-1":
      winner = black;
      winnerColor = "black";
      crown = true;
      break;
      
      case "1/2-1/2":
        winner = "Draw";
        winnerColor = "draw";
      break;

    default:
      winner = current ? "Recent Game" : "In Progress";
  }

  const movesText = pgn.replace(/\[[^\]]+\]/g, "").replace(/\{[^}]+\}/g, "");

  const totalMoves = (movesText.match(/\d+\./g) || []).length;

  return {
    winner,
    winnerColor,
    crown,
    totalMoves,
  };
}

function getPgnPreview(pgn) {
  return pgn
    // Remove PGN headers
    .replace(/\[[^\]]+\]\s*\n?/g, "")

    // Collapse multiple blank lines
    .replace(/\n\s*\n/g, "\n")

    // Convert remaining newlines to spaces
    .replace(/\n/g, " ")

    .trim();
}

function createCard({ date, pgn, current, id} = {}) {
  const card = document.createElement("div");

  const meta = getGameMeta(pgn, current);

  card.className = `history-card ${current ? "current" : ""}`;

  card.innerHTML = `
    <div class="history-top">
      <div class="history-card-title">
        <div class="history-avatar ${meta.winnerColor}"></div>

        <div class="history-winner ${meta.crown ? 'winner' : 'draw'}">
          ${meta.winner} ${ meta.crown ? `
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="lucide lucide-crown-icon lucide-crown"
          >
            <path
              d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"
            />
            <path d="M5 21h14" />
          </svg>
          ` : "" }
        </div>
      </div>

      <div class="history-date">${date}</div>
    </div>

    <div class="history-preview">${escapeHtml(getPgnPreview(pgn))}</div>

    <div class="history-bottom">
      <div class="history-moves">

      <svg width="14" height="14" viewBox="0 0 84 84" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M41.7449 68.2131C34.5469 63.6571 33.1749 58.1591 32.7449 55.1891H37.6179C37.6179 55.1891 39.4199 52.7731 39.4199 50.1111V49.0571L33.9119 45.4631C36.1339 43.2411 37.5059 40.1691 37.5059 36.8931C37.5059 30.3301 32.1099 25.0371 25.5469 25.0371C18.9839 25.0371 13.5879 30.3301 13.5879 36.8931C13.5879 40.1691 14.9599 43.2411 17.1819 45.4631L11.6739 49.0571V50.1111C11.6739 52.6511 13.4759 55.1891 13.4759 55.1891H18.3489C18.0319 58.1491 16.5469 63.6571 9.34887 68.2131C5.22387 70.8551 2.88887 75.7281 2.88887 81.6561C2.88887 82.7111 3.59587 83.4691 4.79387 83.5611C5.99187 83.6531 14.4379 84.0011 25.5369 84.0011C36.6359 84.0011 45.1749 83.6841 46.3929 83.5611C47.6009 83.4381 48.2969 82.7111 48.2969 81.6561C48.2969 75.7281 45.8609 70.8651 41.7339 68.2131H41.7449Z" fill="currentColor"/>
        <path d="M32.8399 46.6421C33.7923 47.8447 35.1375 48.6738 36.6398 48.9843C38.1421 49.2947 39.7058 49.0667 41.0569 48.3401L54.1649 41.2901L77.1549 32.2621C85.6079 28.3321 85.9449 5.20108 78.0789 3.66108C65.4689 1.21808 50.6529 0.135084 37.5489 0.0010835C35.7049 -0.0179165 33.8659 0.211083 32.1299 0.837083C24.2749 3.66608 11.5159 10.4671 7.39587 15.5801C4.74087 18.8621 1.06187 28.6331 0.0538738 33.2221C-0.191126 34.3361 0.418874 35.4181 1.48987 35.8101C11.9609 39.6471 16.0099 24.8791 16.3269 22.9221C21.0641 21.9996 25.6622 20.4686 30.0069 18.3671L30.6089 18.0761C34.9807 19.1487 39.5452 19.1634 43.9239 18.1191L44.1939 18.0551L49.2239 22.1351C49.455 22.3226 49.6425 22.5582 49.7733 22.8255C49.9041 23.0928 49.975 23.3855 49.9812 23.683C49.9874 23.9806 49.9287 24.2759 49.8091 24.5484C49.6895 24.8209 49.512 25.0641 49.2889 25.2611L42.6069 31.1651L34.1339 37.2881C33.4188 37.8049 32.8158 38.4613 32.3612 39.2175C31.9067 39.9737 31.61 40.8142 31.4891 41.6882C31.3682 42.5622 31.4255 43.4516 31.6577 44.3029C31.8898 45.1541 32.292 45.9505 32.8399 46.6421Z" fill="currentColor"/>
      </svg>

        <span>
          ${meta.totalMoves} moves
        </span>
      </div>

      ${ !current ? `
      <button class="delete-btn icon-btn">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          xmlns="http://www.w3.org/2000/svg"
          fill="currentColor"
        >
          <path
            d="M14 2H10C10 0.897 9.103 0 8 0C6.897 0 6 0.897 6 2H2C1.724 2 1.5 2.224 1.5 2.5C1.5 2.776 1.724 3 2 3H2.54L3.349 12.708C3.456 13.994 4.55 15 5.84 15H10.159C11.449 15 12.543 13.993 12.65 12.708L13.459 3H13.999C14.275 3 14.499 2.776 14.499 2.5C14.499 2.224 14.275 2 13.999 2H14ZM8 1C8.551 1 9 1.449 9 2H7C7 1.449 7.449 1 8 1ZM11.655 12.625C11.591 13.396 10.934 14 10.16 14H5.841C5.067 14 4.41 13.396 4.346 12.625L3.544 3H12.458L11.656 12.625H11.655ZM7 5.5V11.5C7 11.776 6.776 12 6.5 12C6.224 12 6 11.776 6 11.5V5.5C6 5.224 6.224 5 6.5 5C6.776 5 7 5.224 7 5.5ZM10 5.5V11.5C10 11.776 9.776 12 9.5 12C9.224 12 9 11.776 9 11.5V5.5C9 5.224 9.224 5 9.5 5C9.776 5 10 5.224 10 5.5Z"
          />
        </svg>
      </button>
      ` : "" }
    </div>
  `;

  card.addEventListener("click", () => {
    vscode.postMessage({
      command: "loadHistory",
      pgn,
    });
  });

  const deleteBtn = card.querySelector(".delete-btn");

  deleteBtn?.addEventListener("click", (e) => {
    e.stopPropagation();

    vscode.postMessage({
      command: "deleteHistory",
      id,
    });

    card.style.opacity = "0";
    card.style.transform = "translateY(-8px)";
  });

  return card;
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
    pgnError.textContent =
      "Error: File is empty (0 bytes). Please select a valid PGN file.";
    return;
  }

  const reader = new FileReader();

  reader.onload = (ev) => {
    pgnInput.value = ev.target.result;
    pgnLoadBtn.disabled = !pgnInput.value.trim();
    pgnError.textContent = "";
  };

  reader.onerror = () => {
    pgnError.textContent =
      "Error reading file: " + (reader.error?.message || "Unknown error");
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

  if (!msg) return;

  if (msg.command === "historyData") {
    renderHistory(msg.data);
    return;
  }

  if (msg.command !== "actionResult") {
    return;
  }

  if (msg.kind === "newGame") {
    newGameStatus.textContent = msg.success
      ? ""
      : msg.error || "Failed to start new game.";
  } else if (msg.kind === "fen") {
    fenLoadBtn.disabled = !fenInput.value.trim();
    fenError.textContent = msg.success
      ? ""
      : msg.error || "Failed to load FEN.";
  } else if (msg.kind === "pgn") {
    pgnLoadBtn.disabled = !pgnInput.value.trim();
    pgnError.textContent = msg.success
      ? ""
      : msg.error || "Failed to load game.";
  }
});

vscode.postMessage({
  command: "requestHistory",
});
