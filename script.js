const scoreEl = document.querySelector("#score");
const comboEl = document.querySelector("#combo");
const healthEl = document.querySelector("#health");
const healthFill = document.querySelector("#health-fill");
const bestScoreEl = document.querySelector("#best-score");
const statusText = document.querySelector("#status-text");
const startButton = document.querySelector("#start-btn");
const buttonLabel = document.querySelector("#button-label");
const gameArea = document.querySelector("#game-area");
const noteLayer = document.querySelector("#note-layer");
const feedback = document.querySelector("#feedback");
const overlay = document.querySelector("#game-overlay");
const overlayIcon = document.querySelector("#overlay-icon");
const overlayTitle = document.querySelector("#overlay-title");
const overlayCopy = document.querySelector("#overlay-copy");
const lanes = [...document.querySelectorAll(".lane")];

const laneKeys = new Map([
  ["a", 0], ["arrowleft", 0],
  ["s", 1], ["arrowdown", 1],
  ["k", 2], ["arrowup", 2],
  ["l", 3], ["arrowright", 3],
]);
const sequence = [0, 1, 2, 3, 1, 2, 0, 3, 0, 2, 1, 3, 2, 1, 0, 3];
const countInDuration = 3;
const leadTime = 2.1;
const hitWindow = 0.18;
const hitLineOffset = 68;
const noteHeight = 13;

let notes = [];
let score = 0;
let combo = 0;
let health = 100;
let bestScore = readBestScore();
let gameStarted = false;
let startTime = 0;
let currentTime = -countInDuration;
let lastNoteTime = 0;
let animationId = null;
let lastFeedback = "";

function readBestScore() {
  try {
    const storedScore = Number(localStorage.getItem("neon-rhythm-best") || 0);
    return Number.isFinite(storedScore) && storedScore > 0 ? storedScore : 0;
  } catch (error) {
    console.warn("Could not read the saved personal best.", error);
    return 0;
  }
}

function saveBestScore() {
  try {
    localStorage.setItem("neon-rhythm-best", String(bestScore));
  } catch (error) {
    console.warn("Could not save the personal best.", error);
  }
}

function formatScore(value) {
  return String(value).padStart(6, "0");
}

function updateHud() {
  scoreEl.textContent = formatScore(score);
  comboEl.textContent = `× ${combo}`;
  healthEl.textContent = `${Math.ceil(health)}%`;
  healthFill.style.width = `${health}%`;
  healthFill.style.background = health <= 30 ? "#ff7189" : "";
  bestScoreEl.textContent = formatScore(bestScore);
}

function generatePattern() {
  const pattern = [];
  const baseStep = 0.52;

  for (let index = 0; index < 52; index += 1) {
    const lane = sequence[index % sequence.length];
    const time = index * baseStep + (index % 5 === 0 ? 0.1 : 0);
    pattern.push({ id: `note-${index}`, lane, time, hit: false, missed: false });

    if (index % 6 === 0 && index < 48) {
      pattern.push({
        id: `note-${index}-alt`,
        lane: (lane + 1 + (index % 2)) % 4,
        time: time + 0.24,
        hit: false,
        missed: false,
      });
    }
  }

  return pattern.sort((first, second) => first.time - second.time);
}

function setStatus(message) {
  statusText.textContent = message;
}

function showOverlay(icon, title, copy) {
  overlayIcon.textContent = icon;
  overlayTitle.textContent = title;
  overlayCopy.textContent = copy;
  overlay.classList.remove("is-hidden");
}

function startGame() {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
  }

  score = 0;
  combo = 0;
  health = 100;
  notes = generatePattern();
  gameStarted = true;
  startTime = performance.now();
  currentTime = -countInDuration;
  lastNoteTime = notes[notes.length - 1].time;
  lastFeedback = "";
  noteLayer.replaceChildren();
  feedback.className = "feedback";
  overlay.classList.add("is-hidden");
  buttonLabel.textContent = "Restart";
  updateHud();
  setStatus(`Get ready... ${countInDuration}`);
  animationId = requestAnimationFrame(gameLoop);
}

function endGame(message) {
  gameStarted = false;
  animationId = null;
  buttonLabel.textContent = "Play again";
  noteLayer.replaceChildren();
  showOverlay(message === "Song clear!" ? "✦" : "↻", message, `Final score: ${formatScore(score)}`);
  setStatus(message === "Song clear!" ? "Beautiful run. The beat is yours." : "Take a breath and try again.");
}

function showFeedback(message, isMiss = false) {
  if (lastFeedback === message) {
    feedback.classList.remove("show");
    void feedback.offsetWidth;
  }
  lastFeedback = message;
  feedback.textContent = message;
  feedback.className = `feedback${isMiss ? " miss" : ""} show`;
}

function renderNotes() {
  const height = gameArea.clientHeight;
  const travelDistance = height - hitLineOffset - noteHeight / 2;
  const visibleNotes = notes.filter((note) => {
    const timeToHit = note.time - currentTime;
    return !note.hit && !note.missed && timeToHit <= leadTime && timeToHit >= -0.35;
  });
  const noteElements = visibleNotes.map((note) => {
    const timeToHit = note.time - currentTime;
    const progress = 1 - timeToHit / leadTime;
    const element = document.createElement("div");
    element.className = `note lane-${note.lane}`;
    element.dataset.noteId = note.id;
    element.style.left = `${(note.lane + 0.5) * 25}%`;
    element.style.top = `${Math.max(0, Math.min(travelDistance, progress * travelDistance))}px`;
    return element;
  });

  noteLayer.replaceChildren(...noteElements);
}

function hitLane(lane) {
  if (!gameStarted || currentTime < 0) return;

  const bestMatch = notes.reduce((best, note) => {
    if (note.lane !== lane || note.hit || note.missed) return best;
    const difference = Math.abs(note.time - currentTime);
    if (difference > hitWindow || (best && difference >= best.difference)) return best;
    return { note, difference };
  }, null);

  if (!bestMatch) {
    combo = 0;
    health = Math.max(0, health - 10);
    showFeedback("OFF BEAT", true);
    setStatus("Off beat — find the next note.");
    updateHud();
    return;
  }

  const { note, difference } = bestMatch;
  note.hit = true;
  const accuracy = 1 - difference / hitWindow;
  const points = Math.round(150 + accuracy * 120 + combo * 18);
  score += points;
  combo += 1;
  health = Math.min(100, health + 6);
  showFeedback(difference < hitWindow * 0.35 ? "PERFECT" : "GREAT");
  setStatus(`Nice hit! +${points} points`);

  if (score > bestScore) {
    bestScore = score;
    saveBestScore();
  }
  updateHud();
}

function handleMissedNotes() {
  let missedCount = 0;
  for (const note of notes) {
    if (!note.hit && !note.missed && note.time + 0.2 < currentTime) {
      note.missed = true;
      missedCount += 1;
    }
  }

  if (missedCount > 0) {
    combo = 0;
    health = Math.max(0, health - 15 * missedCount);
    showFeedback("MISS", true);
    setStatus("Missed a note — stay with the rhythm.");
    updateHud();
  }
}

function gameLoop(timestamp) {
  if (!gameStarted) return;
  currentTime = (timestamp - startTime) / 1000 - countInDuration;

  if (currentTime < 0) {
    setStatus(`Get ready... ${Math.ceil(-currentTime)}`);
    animationId = requestAnimationFrame(gameLoop);
    return;
  }

  if (currentTime < 0.05) setStatus("The beat is live. Hit the notes!");
  renderNotes();
  handleMissedNotes();

  if (health <= 0) {
    endGame("Game over");
    return;
  }

  const hasNotesLeft = notes.some((note) => !note.hit && !note.missed);
  if (!hasNotesLeft && currentTime > lastNoteTime + 1) {
    endGame("Song clear!");
    return;
  }

  animationId = requestAnimationFrame(gameLoop);
}

function pressLane(lane) {
  const laneButton = lanes[lane];
  if (!laneButton) return;
  laneButton.classList.add("is-pressed");
  window.setTimeout(() => laneButton.classList.remove("is-pressed"), 110);
  hitLane(lane);
}

document.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const key = event.key.toLowerCase();

  if (key === " " && !gameStarted) {
    event.preventDefault();
    startGame();
    return;
  }

  const lane = laneKeys.get(key);
  if (lane !== undefined) {
    event.preventDefault();
    pressLane(lane);
  }
});

startButton.addEventListener("click", startGame);
lanes.forEach((lane) => {
  lane.addEventListener("click", () => pressLane(Number(lane.dataset.lane)));
});

updateHud();
