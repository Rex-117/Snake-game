(() => {
  "use strict";

  const GRID_SIZE = 24;
  const COMBO_WINDOW = 5000;
  const BONUS_DURATION = 7000;
  const SPEEDS = {
    chill: { label: "Chill", tick: 155 },
    classic: { label: "Classic", tick: 112 },
    hyper: { label: "Hyper", tick: 78 },
  };

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const elements = {
    score: document.getElementById("scoreValue"),
    length: document.getElementById("lengthValue"),
    fruit: document.getElementById("fruitValue"),
    combo: document.getElementById("comboValue"),
    comboBar: document.getElementById("comboBar"),
    comboBlock: document.getElementById("comboBlock"),
    pauseButton: document.getElementById("pauseButton"),
    pauseIcon: document.getElementById("pauseIcon"),
    pauseLabel: document.getElementById("pauseLabel"),
    overlay: document.getElementById("gameOverlay"),
    overlayKicker: document.getElementById("overlayKicker"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayCopy: document.getElementById("overlayCopy"),
    startButton: document.getElementById("startButton"),
    soundButton: document.getElementById("soundButton"),
    soundLabel: document.getElementById("soundLabel"),
    bonusTimer: document.getElementById("bonusTimer"),
    bonusTime: document.getElementById("bonusTime"),
    highScore: document.getElementById("highScoreValue"),
    recordSpeed: document.getElementById("recordSpeed"),
    modal: document.getElementById("gameOverModal"),
    finalScore: document.getElementById("finalScore"),
    finalFruit: document.getElementById("finalFruit"),
    finalLength: document.getElementById("finalLength"),
    finalCombo: document.getElementById("finalCombo"),
    newRecord: document.getElementById("newRecord"),
    againButton: document.getElementById("againButton"),
    closeModalButton: document.getElementById("closeModalButton"),
    toast: document.getElementById("toast"),
  };

  const directionVectors = {
    up: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
  };

  const oppositeDirections = { up: "down", down: "up", left: "right", right: "left" };
  const keyDirections = {
    ArrowUp: "up", w: "up", W: "up",
    ArrowRight: "right", d: "right", D: "right",
    ArrowDown: "down", s: "down", S: "down",
    ArrowLeft: "left", a: "left", A: "left",
  };

  const state = {
    status: "ready",
    speed: "classic",
    snake: [],
    previousSnake: [],
    direction: "right",
    queuedDirection: "right",
    turnLocked: false,
    food: null,
    bonus: null,
    bonusExpires: 0,
    score: 0,
    fruit: 0,
    combo: 1,
    maxCombo: 1,
    comboExpires: 0,
    growth: 0,
    lastFrame: 0,
    accumulator: 0,
    sound: true,
    audioContext: null,
    particles: [],
  };

  let displaySize = 720;
  let pixelRatio = 1;
  let pointerStart = null;
  let toastTimeout = null;

  function resetGame() {
    const middle = Math.floor(GRID_SIZE / 2);
    state.snake = [
      { x: middle + 1, y: middle },
      { x: middle, y: middle },
      { x: middle - 1, y: middle },
      { x: middle - 2, y: middle },
    ];
    state.previousSnake = state.snake.map((part) => ({ ...part }));
    state.direction = "right";
    state.queuedDirection = "right";
    state.turnLocked = false;
    state.food = randomOpenCell();
    state.bonus = null;
    state.bonusExpires = 0;
    state.score = 0;
    state.fruit = 0;
    state.combo = 1;
    state.maxCombo = 1;
    state.comboExpires = 0;
    state.growth = 0;
    state.accumulator = 0;
    state.lastFrame = performance.now();
    state.particles = [];
    state.status = "ready";
    elements.modal.hidden = true;
    elements.overlay.classList.remove("hidden");
    elements.overlayKicker.textContent = "Ready when you are";
    elements.overlayTitle.textContent = "Feed the signal.";
    elements.overlayCopy.textContent = "Use arrow keys or WASD to start";
    elements.startButton.innerHTML = 'Start game <span aria-hidden="true">→</span>';
    elements.pauseButton.disabled = true;
    elements.pauseIcon.textContent = "Ⅱ";
    elements.pauseLabel.textContent = "Pause";
    elements.bonusTimer.hidden = true;
    updateHud();
    updateRecord();
    canvas.focus({ preventScroll: true });
  }

  function startGame(initialDirection = null) {
    if (state.status === "over") resetGame();
    if (initialDirection && oppositeDirections[initialDirection] !== state.direction) {
      state.queuedDirection = initialDirection;
      state.turnLocked = initialDirection !== state.direction;
    }
    state.status = "running";
    state.lastFrame = performance.now();
    state.accumulator = 0;
    elements.overlay.classList.add("hidden");
    elements.pauseButton.disabled = false;
    playTone(280, 0.07, 0.025);
    window.setTimeout(() => playTone(420, 0.08, 0.02), 70);
  }

  function togglePause() {
    if (state.status === "ready") {
      startGame();
      return;
    }
    if (state.status === "over") return;
    if (state.status === "running") {
      state.status = "paused";
      elements.overlayKicker.textContent = "Game suspended";
      elements.overlayTitle.textContent = "Hold that thought.";
      elements.overlayCopy.textContent = "Press Space or the button to continue";
      elements.startButton.innerHTML = 'Resume game <span aria-hidden="true">→</span>';
      elements.overlay.classList.remove("hidden");
      elements.pauseIcon.textContent = "▶";
      elements.pauseLabel.textContent = "Resume";
    } else {
      state.status = "running";
      state.lastFrame = performance.now();
      elements.overlay.classList.add("hidden");
      elements.pauseIcon.textContent = "Ⅱ";
      elements.pauseLabel.textContent = "Pause";
    }
  }

  function steer(direction) {
    if (!direction) return;
    if (state.status === "ready") {
      startGame(direction);
      return;
    }
    if (state.status !== "running") return;
    if (!state.turnLocked && direction !== state.direction && oppositeDirections[direction] !== state.direction) {
      state.queuedDirection = direction;
      state.turnLocked = true;
    }
  }

  function currentTick() {
    return Math.max(54, SPEEDS[state.speed].tick - Math.min(28, state.fruit * 1.35));
  }

  function updateGame(now) {
    state.direction = state.queuedDirection;
    state.turnLocked = false;
    const vector = directionVectors[state.direction];
    const head = state.snake[0];
    const next = { x: head.x + vector.x, y: head.y + vector.y };
    const getsFood = sameCell(next, state.food);
    const getsBonus = state.bonus && sameCell(next, state.bonus);
    const keepsTail = state.growth > 0 || getsFood || getsBonus;
    const body = keepsTail ? state.snake : state.snake.slice(0, -1);

    if (
      next.x < 0 || next.y < 0 || next.x >= GRID_SIZE || next.y >= GRID_SIZE ||
      body.some((part) => sameCell(part, next))
    ) {
      endGame(next);
      return;
    }

    state.previousSnake = state.snake.map((part) => ({ ...part }));
    state.snake.unshift(next);

    if (getsFood) eatFood(now);
    if (getsBonus) eatBonus(now);

    if (state.growth > 0) state.growth -= 1;
    else state.snake.pop();
  }

  function eatFood(now) {
    const quickCatch = state.comboExpires > now;
    state.combo = quickCatch ? Math.min(5, state.combo + 1) : 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.comboExpires = now + COMBO_WINDOW;
    state.score += 10 * state.combo;
    state.fruit += 1;
    state.growth += 1;
    burst(state.food, "#ff8d5d", 13);
    state.food = randomOpenCell();
    playTone(350 + state.combo * 80, 0.09, 0.04);

    if (state.fruit % 5 === 0 && !state.bonus) spawnBonus(now);
    updateHud();
  }

  function spawnBonus(now) {
    state.bonus = randomOpenCell();
    state.bonusExpires = now + BONUS_DURATION;
    elements.bonusTimer.hidden = false;
    showToast("◆ Prism signal detected");
    playTone(760, 0.16, 0.035);
  }

  function eatBonus(now) {
    state.score += 75 * state.combo;
    state.growth += 3;
    burst(state.bonus, "#b59cff", 24);
    state.bonus = null;
    state.bonusExpires = 0;
    elements.bonusTimer.hidden = true;
    state.comboExpires = now + COMBO_WINDOW;
    showToast(`Prism captured · +${75 * state.combo}`);
    [570, 720, 910].forEach((tone, index) => {
      window.setTimeout(() => playTone(tone, 0.16, 0.035), index * 65);
    });
    updateHud();
  }

  function endGame(crashCell) {
    state.status = "over";
    elements.pauseButton.disabled = true;
    elements.bonusTimer.hidden = true;
    const safeCrash = {
      x: Math.max(0, Math.min(GRID_SIZE - 1, crashCell.x)),
      y: Math.max(0, Math.min(GRID_SIZE - 1, crashCell.y)),
    };
    burst(safeCrash, "#ff6f61", 30);
    playCrashSound();

    const record = readRecord();
    const isNewRecord = state.score > record.score;
    if (isNewRecord) writeRecord(state.score, state.speed);

    elements.finalScore.textContent = formatScore(state.score);
    elements.finalFruit.textContent = state.fruit.toString();
    elements.finalLength.textContent = state.snake.length.toString();
    elements.finalCombo.textContent = `×${state.maxCombo}`;
    elements.newRecord.hidden = !isNewRecord;

    window.setTimeout(() => {
      elements.modal.hidden = false;
      elements.againButton.focus();
      updateRecord();
    }, 500);
  }

  function randomOpenCell() {
    const blocked = new Set(state.snake.map((part) => `${part.x},${part.y}`));
    if (state.food) blocked.add(`${state.food.x},${state.food.y}`);
    if (state.bonus) blocked.add(`${state.bonus.x},${state.bonus.y}`);
    const open = [];
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if (!blocked.has(`${x},${y}`)) open.push({ x, y });
      }
    }
    return open[Math.floor(Math.random() * open.length)] || { x: 1, y: 1 };
  }

  function sameCell(a, b) {
    return Boolean(a && b && a.x === b.x && a.y === b.y);
  }

  function updateHud() {
    elements.score.textContent = formatScore(state.score);
    elements.length.textContent = state.snake.length.toString();
    elements.fruit.textContent = state.fruit.toString();
    elements.combo.textContent = `×${state.combo}`;
  }

  function formatScore(score) {
    return score.toString().padStart(4, "0");
  }

  function readRecord() {
    try {
      const saved = JSON.parse(localStorage.getItem("afterdark-snake-record") || "null");
      return saved && Number.isFinite(saved.score) ? saved : { score: 0, speed: null };
    } catch (_error) {
      return { score: 0, speed: null };
    }
  }

  function writeRecord(score, speed) {
    try {
      localStorage.setItem("afterdark-snake-record", JSON.stringify({ score, speed }));
    } catch (_error) {
      // Storage can be unavailable in private browsing; gameplay is unaffected.
    }
  }

  function updateRecord() {
    const record = readRecord();
    elements.highScore.textContent = formatScore(record.score);
    elements.recordSpeed.textContent = record.speed ? `${SPEEDS[record.speed].label} velocity` : "No runs yet";
  }

  function selectSpeed(button) {
    document.querySelectorAll("[data-speed]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.speed = button.dataset.speed;
    resetGame();
    showToast(`${SPEEDS[state.speed].label} velocity selected`);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    displaySize = Math.max(1, Math.min(rect.width, rect.height));
    pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(rect.width * pixelRatio);
    const height = Math.round(rect.height * pixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function render(now) {
    resizeCanvas();

    const delta = Math.min(80, now - state.lastFrame);
    state.lastFrame = now;
    if (state.status === "running") {
      state.accumulator += delta;
      const tick = currentTick();
      while (state.accumulator >= tick && state.status === "running") {
        state.accumulator -= tick;
        updateGame(now);
      }
      updateTimedItems(now);
    }

    updateParticles(delta);
    drawScene(now);
    window.requestAnimationFrame(render);
  }

  function updateTimedItems(now) {
    if (state.combo > 1 && now >= state.comboExpires) {
      state.combo = 1;
      updateHud();
    }
    const comboRemaining = state.combo > 1 ? Math.max(0, (state.comboExpires - now) / COMBO_WINDOW) : 0;
    elements.comboBar.style.width = `${comboRemaining * 100}%`;

    if (state.bonus) {
      const remaining = Math.max(0, state.bonusExpires - now);
      elements.bonusTime.textContent = (remaining / 1000).toFixed(1);
      if (remaining <= 0) {
        state.bonus = null;
        elements.bonusTimer.hidden = true;
        playTone(160, 0.08, 0.018);
      }
    }
  }

  function drawScene(now) {
    const size = displaySize;
    const padding = Math.max(24, size * 0.055);
    const boardSize = size - padding * 2;
    const cell = boardSize / GRID_SIZE;
    ctx.clearRect(0, 0, size, size);

    const background = ctx.createRadialGradient(size * 0.45, size * 0.42, 0, size / 2, size / 2, size * 0.75);
    background.addColorStop(0, "#111823");
    background.addColorStop(1, "#080b10");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);

    drawGrid(padding, boardSize, cell);
    drawFood(state.food, padding, cell, now);
    if (state.bonus) drawBonus(state.bonus, padding, cell, now);
    drawSnake(padding, cell, now);
    drawParticles(padding, cell);
  }

  function drawGrid(padding, boardSize, cell) {
    ctx.save();
    ctx.strokeStyle = "rgba(182, 199, 210, 0.055)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let index = 0; index <= GRID_SIZE; index += 1) {
      const point = padding + index * cell;
      ctx.moveTo(point, padding);
      ctx.lineTo(point, padding + boardSize);
      ctx.moveTo(padding, point);
      ctx.lineTo(padding + boardSize, point);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(201, 255, 114, 0.2)";
    ctx.strokeRect(padding - 4, padding - 4, boardSize + 8, boardSize + 8);
    ctx.restore();
  }

  function centerOf(part, padding, cell) {
    return { x: padding + (part.x + 0.5) * cell, y: padding + (part.y + 0.5) * cell };
  }

  function interpolatedSnake() {
    if (state.status !== "running" || !state.previousSnake.length) return state.snake;
    const progress = Math.min(1, state.accumulator / currentTick());
    return state.snake.map((part, index) => {
      const previous = state.previousSnake[Math.min(index, state.previousSnake.length - 1)] || part;
      return {
        x: previous.x + (part.x - previous.x) * progress,
        y: previous.y + (part.y - previous.y) * progress,
      };
    });
  }

  function drawSnake(padding, cell, now) {
    const snake = interpolatedSnake();
    if (!snake.length) return;
    const points = snake.map((part) => centerOf(part, padding, cell));
    const bodyWidth = Math.max(5, cell * 0.66);
    const gradient = ctx.createLinearGradient(points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y);
    gradient.addColorStop(0, "#dcff9f");
    gradient.addColorStop(0.45, "#9fdb5d");
    gradient.addColorStop(1, "#47663a");

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(201, 255, 114, 0.25)";
    ctx.shadowBlur = cell * 0.5;
    ctx.strokeStyle = gradient;
    ctx.lineWidth = bodyWidth;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    for (let index = 1; index < points.length; index += 1) {
      const alpha = 0.18 * (1 - index / points.length);
      ctx.fillStyle = `rgba(244, 255, 220, ${alpha})`;
      ctx.beginPath();
      ctx.arc(points[index].x - bodyWidth * 0.12, points[index].y - bodyWidth * 0.12, bodyWidth * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    drawHead(points[0], bodyWidth, now);
    ctx.restore();
  }

  function drawHead(head, width, now) {
    ctx.fillStyle = "#e3ffad";
    ctx.beginPath();
    ctx.arc(head.x, head.y, width * 0.54, 0, Math.PI * 2);
    ctx.fill();

    const vector = directionVectors[state.direction];
    const side = { x: -vector.y, y: vector.x };
    [-1, 1].forEach((sign) => {
      const eye = {
        x: head.x + vector.x * width * 0.23 + side.x * width * 0.2 * sign,
        y: head.y + vector.y * width * 0.23 + side.y * width * 0.2 * sign,
      };
      ctx.fillStyle = "#10150f";
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, Math.max(1.1, width * 0.075), 0, Math.PI * 2);
      ctx.fill();
    });

    if (state.status === "ready") {
      ctx.strokeStyle = `rgba(201, 255, 114, ${0.18 + Math.sin(now / 420) * 0.08})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(head.x, head.y, width * 1.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawFood(food, padding, cell, now) {
    if (!food) return;
    const center = centerOf(food, padding, cell);
    const pulse = 0.9 + Math.sin(now / 280) * 0.08;
    const radius = cell * 0.25 * pulse;
    ctx.save();
    ctx.shadowColor = "#ff8d5d";
    ctx.shadowBlur = cell * 0.9;
    ctx.fillStyle = "#ff9b70";
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffe3d5";
    ctx.beginPath();
    ctx.arc(center.x - radius * 0.28, center.y - radius * 0.28, radius * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 141, 93, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius * 1.75, now / 800, now / 800 + Math.PI * 1.3);
    ctx.stroke();
    ctx.restore();
  }

  function drawBonus(bonus, padding, cell, now) {
    const center = centerOf(bonus, padding, cell);
    const radius = cell * 0.32;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(now / 650);
    ctx.shadowColor = "#b59cff";
    ctx.shadowBlur = cell * 1.1;
    ctx.fillStyle = "#c8b6ff";
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius, 0);
    ctx.lineTo(0, radius);
    ctx.lineTo(-radius, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(229, 218, 255, 0.5)";
    ctx.stroke();
    ctx.restore();
  }

  function burst(cellPosition, color, count) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.7 + Math.random() * 2.1;
      state.particles.push({
        x: cellPosition.x + 0.5,
        y: cellPosition.y + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: 0.05 + Math.random() * 0.09,
        color,
      });
    }
  }

  function updateParticles(delta) {
    state.particles.forEach((particle) => {
      particle.x += particle.vx * delta / 500;
      particle.y += particle.vy * delta / 500;
      particle.life -= delta / 700;
      particle.vx *= 0.98;
      particle.vy *= 0.98;
    });
    state.particles = state.particles.filter((particle) => particle.life > 0);
  }

  function drawParticles(padding, cell) {
    state.particles.forEach((particle) => {
      ctx.globalAlpha = Math.max(0, particle.life);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(padding + particle.x * cell, padding + particle.y * cell, particle.size * cell, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function toggleSound() {
    state.sound = !state.sound;
    elements.soundButton.setAttribute("aria-pressed", state.sound.toString());
    elements.soundLabel.textContent = state.sound ? "Sound on" : "Sound off";
    elements.soundButton.firstElementChild.textContent = state.sound ? "♪" : "×";
    if (state.sound) playTone(440, 0.08, 0.025);
  }

  function playTone(frequency, duration, volume) {
    if (!state.sound) return;
    try {
      if (!state.audioContext) state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = state.audioContext.createOscillator();
      const gain = state.audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, state.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, state.audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(state.audioContext.destination);
      oscillator.start();
      oscillator.stop(state.audioContext.currentTime + duration);
    } catch (_error) {
      state.sound = false;
    }
  }

  function playCrashSound() {
    [260, 190, 125].forEach((tone, index) => {
      window.setTimeout(() => playTone(tone, 0.18, 0.04), index * 85);
    });
  }

  function showToast(message) {
    clearTimeout(toastTimeout);
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    toastTimeout = window.setTimeout(() => elements.toast.classList.remove("show"), 2100);
  }

  function closeModal() {
    elements.modal.hidden = true;
    canvas.focus({ preventScroll: true });
  }

  document.addEventListener("keydown", (event) => {
    const direction = keyDirections[event.key];
    if (direction) {
      event.preventDefault();
      steer(direction);
      return;
    }
    if (event.code === "Space" || event.key === "p" || event.key === "P") {
      event.preventDefault();
      togglePause();
    }
    if (event.key === "r" || event.key === "R") resetGame();
    if (event.key === "Escape" && !elements.modal.hidden) closeModal();
  });

  document.querySelectorAll("[data-direction]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      steer(button.dataset.direction);
    });
  });

  document.querySelectorAll("[data-speed]").forEach((button) => {
    button.addEventListener("click", () => selectSpeed(button));
  });

  canvas.addEventListener("pointerdown", (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 15) return;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  });

  elements.startButton.addEventListener("click", () => {
    if (state.status === "paused") togglePause();
    else startGame();
  });
  elements.pauseButton.addEventListener("click", togglePause);
  elements.soundButton.addEventListener("click", toggleSound);
  elements.againButton.addEventListener("click", () => {
    resetGame();
    startGame();
  });
  elements.closeModalButton.addEventListener("click", () => {
    closeModal();
    resetGame();
  });
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) {
      closeModal();
      resetGame();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.status === "running") togglePause();
  });
  window.addEventListener("resize", resizeCanvas);

  resetGame();
  window.requestAnimationFrame(render);
})();
