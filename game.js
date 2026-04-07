const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const hudEl = document.getElementById("hud");
const p1LifeSpan = document.getElementById("p1-life");
const p2LifeSpan = document.getElementById("p2-life");

const mainMenuEl = document.getElementById("main-menu");
const botMenuEl = document.getElementById("bot-menu");
const controlsOverlayEl = document.getElementById("controls-overlay");
const controlsContentEl = document.getElementById("controls-content");

const btnBot = document.getElementById("btn-bot");
const btnLocal = document.getElementById("btn-local");
const btnOnline = document.getElementById("btn-online");
const btnBotBack = document.getElementById("btn-bot-back");
const botDiffButtons = botMenuEl.querySelectorAll("[data-bot-diff]");


const ASSETS_Ships = {
  BlueShip: "assets/sprites/tiny-spaceships/4X/tiny_ship7.png", // Dimensao: 160x80
  RedShip: "assets/sprites/tiny-spaceships/4X/tiny_ship10.png" // Dimensao: 160x112
};

const ASSETS_Audios = {
  hurtHit: "assets/sounds/hurt_c_08-102842.mp3",
  laserShot: "assets/sounds/laser-shot-ingame-230500.mp3"
};

const shipImages = {
  p1: new Image(),
  p2: new Image()
};
shipImages.p1.src = ASSETS_Ships.BlueShip;
shipImages.p2.src = ASSETS_Ships.RedShip;

const audioAssets = {
  hurtHit: new Audio(ASSETS_Audios.hurtHit),
  laserShot: new Audio(ASSETS_Audios.laserShot)
};
audioAssets.hurtHit.volume = 0.6;
audioAssets.laserShot.volume = 0.5;

let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  Object.values(audioAssets).forEach((audio) => {
    audio.muted = true;
    audio.play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      })
      .catch(() => {
        audio.muted = false;
      });
  });
}

function playSfx(audio) {
  if (!audioUnlocked || !audio) return;
  const snd = audio.cloneNode();
  snd.volume = audio.volume;
  snd.play().catch(() => {});
}

window.addEventListener("keydown", unlockAudio, { once: true });
canvas.addEventListener("pointerdown", unlockAudio, { once: true });
document.addEventListener("click", unlockAudio, { once: true });


// Estado das teclas
const keys = {};
window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  keys[key] = true;

  // ESC: volta ao menu principal de qualquer cena
  if (key === "escape") {
    setScene("menu");
  }

  // R: reinicia partida local ou vs BOT
  if (key === "r" && (currentScene === "local" || currentScene === "bot") && gameOver) {
    resetGame();
  }
});

//Teste para o SDK do Nexus-Score
let nexusReady = false;

if (window.NexusGameSDK) {
  NexusGameSDK.init({
    gameSlug: "duelo-galactico",
    onAuth: function (context) {
      // contexto do jogador vindo do Hub
      nexusReady = true;
      console.log("Hub conectado:", context);
    },
  });
}

window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Utilitário
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

let currentScene = "menu"; // "menu" | "local" | "bot" | "online"
let botDifficulty = "medium"; // padrão
let lastTime = 0;
let gameOver = false;
let winner = null;
let controlsVisible = false;

// Controlador do BOT (instanciado ao entrar no modo vs BOT)
let botBrain = null;

// Classes base
class Bullet {
  constructor(x, y, vx, vy, owner, speed = 500) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = 5;
    this.speed = speed;
    this.owner = owner; // "p1" ou "p2"
    this.alive = true;
  }

  update(dt) {
    this.x += this.vx * this.speed * dt;
    this.y += this.vy * this.speed * dt;

    if (
      this.x < -20 ||
      this.x > canvas.width + 20 ||
      this.y < -20 ||
      this.y > canvas.height + 20
    ) {
      this.alive = false;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.owner === "p1" ? "#4cc9f0" : "#f72585";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
  }
}

class Ship {
  constructor(x, y, color, controls, id) {
    this.x = x;
    this.y = y;
    this.radius = 20;
    this.color = color;
    this.baseSpeed = 250;
    this.speed = this.baseSpeed;
    this.life = 100;
    this.id = id;

    this.controls = controls;
    this.canShoot = true;
    this.shootCooldown = 0.25;
    this.shootTimer = 0;

    this.prevX = x;
    this.prevY = y;
    this.velX = 0;
    this.velY = 0;
  }

  setAsHuman() {
    this.speed = this.baseSpeed;
    this.shootCooldown = 0.25;
    this.shootTimer = 0;
    this.canShoot = true;
    this.syncPosition();
  }

  update(dt, bullets) {
    this.updateHuman(dt, bullets);
    this.trackVelocity(dt);
  }

  trackVelocity(dt) {
    if (dt <= 0) return;
    this.velX = (this.x - this.prevX) / dt;
    this.velY = (this.y - this.prevY) / dt;
    this.prevX = this.x;
    this.prevY = this.y;
  }

  syncPosition() {
    this.prevX = this.x;
    this.prevY = this.y;
    this.velX = 0;
    this.velY = 0;
  }

  handleShootCooldown(dt) {
    if (this.shootTimer > 0) {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.canShoot = true;
        this.shootTimer = 0;
      }
    }
  }

  updateHuman(dt, bullets) {
    let vx = 0;
    let vy = 0;

    if (keys[this.controls.up]) vy -= 1;
    if (keys[this.controls.down]) vy += 1;
    if (keys[this.controls.left]) vx -= 1;
    if (keys[this.controls.right]) vx += 1;

    const length = Math.hypot(vx, vy);
    if (length > 0) {
      vx /= length;
      vy /= length;
    }

    this.x += vx * this.speed * dt;
    this.y += vy * this.speed * dt;

    this.x = clamp(this.x, this.radius, canvas.width - this.radius);
    this.y = clamp(this.y, this.radius, canvas.height - this.radius);

    this.handleShootCooldown(dt);

    if (keys[this.controls.shoot] && this.canShoot) {
      this.shoot(bullets);
      this.canShoot = false;
      this.shootTimer = this.shootCooldown;
    }
  }


  shoot(bullets) {
    const dir = this.id === "p1" ? 1 : -1;
    const bullet = new Bullet(
      this.x + dir * (this.radius + 4),
      this.y,
      dir,
      0,
      this.id
    );
    bullets.push(bullet);
    playSfx(audioAssets.laserShot);
  }

  draw(ctx) {
    const img = this.id === "p1" ? shipImages.p1 : shipImages.p2;
    if (img && img.complete && img.naturalWidth > 0) {
      const scale = 0.5;
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;

      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.id === "p1" ? Math.PI / 2 : -Math.PI / 2);
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.beginPath();
    ctx.moveTo(this.id === "p1" ? 40 : -40, 0);
    ctx.lineTo(this.id === "p1" ? 10 : -10, -16);
    ctx.lineTo(this.id === "p1" ? 10 : -10, 16);
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 15;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.id === "p1" ? 18 : -18, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.8;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  }
}

// Estado do jogo (naves e balas)
const bullets = [];

const player1 = new Ship(
  canvas.width * 0.25,
  canvas.height * 0.5,
  "#4cc9f0",
  {
    up: "w",
    down: "s",
    left: "a",
    right: "d",
    shoot: "f",
  },
  "p1"
);

const player2 = new Ship(
  canvas.width * 0.75,
  canvas.height * 0.5,
  "#f72585",
  {
    up: "arrowup",
    down: "arrowdown",
    left: "arrowleft",
    right: "arrowright",
    shoot: "l",
  },
  "p2"
);

// Colisões
function checkCollisions() {
  bullets.forEach((bullet) => {
    if (!bullet.alive) return;

    const target = bullet.owner === "p1" ? player2 : player1;
    const dx = bullet.x - target.x;
    const dy = bullet.y - target.y;
    const dist = Math.hypot(dx, dy);

    if (dist < bullet.radius + target.radius) {
      bullet.alive = false;
      target.life -= 10;
      target.life = Math.max(0, target.life);
      playSfx(audioAssets.hurtHit);
    }
  });
}

// Fundo
function drawBackground(ctx) {
  const gradient = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    0,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width
  );
  gradient.addColorStop(0, "#050816");
  gradient.addColorStop(1, "#000000");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 80; i++) {
    const x = (i * 97) % canvas.width;
    const y = (i * 53) % canvas.height;
    const r = (i % 3) + 1;
    ctx.globalAlpha = 0.2 + (i % 5) * 0.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Tela de texto genérica
function drawTextScreen(title, lines) {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";

  ctx.font = "36px system-ui";
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 40);

  ctx.font = "18px system-ui";
  lines.forEach((line, index) => {
    ctx.fillText(line, canvas.width / 2, canvas.height / 2 + index * 24);
  });

  ctx.restore();
}

// Tela de Game Over
function drawGameOver() {
  let msg;
  if (currentScene === "bot") {
    msg = winner === "p1" ? "Você venceu o BOT!" : "O BOT venceu você!";
  } else {
    msg =
      winner === "p1"
        ? "Jogador 1 (AZUL) venceu!"
        : "Jogador 2 (VERMELHO) venceu!";
  }

  drawTextScreen("Fim de jogo!", [
    msg,
    "",
    "Pressione R para reiniciar",
    "Ou ESC para voltar ao menu",
  ]);
}

// Cena: Menu (complemento visual)
function drawMenuScene() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "20px system-ui";
  ctx.fillText(
    "SPACE DUEL 1v1",
    canvas.width / 2,
    canvas.height / 2 - 120
  );
  ctx.font = "14px system-ui";
  ctx.fillText(
    "Use o menu para escolher o modo de jogo.",
    canvas.width / 2,
    canvas.height / 2 - 90
  );
  ctx.restore();
}

// Cena: Online (placeholder)
function drawOnlineScene() {
  drawTextScreen("Multiplayer Online", [
    "Comming Soon!",
  ]);
}

// Reset da partida (usado em local e vs BOT)
function resetGame() {
  player1.x = canvas.width * 0.25;
  player1.y = canvas.height * 0.5;
  player1.life = 100;

  player2.x = canvas.width * 0.75;
  player2.y = canvas.height * 0.5;
  player2.life = 100;
  player1.syncPosition();
  player2.syncPosition();
  if (botBrain && typeof botBrain.reset === "function") {
    botBrain.reset();
  }

  bullets.length = 0;
  gameOver = false;
  winner = null;

  p1LifeSpan.textContent = player1.life;
  p2LifeSpan.textContent = player2.life;
}

// Atualização da partida local
function updateLocalGame(dt) {
  if (gameOver) return;

  player1.update(dt, bullets);
  player2.update(dt, bullets);

  bullets.forEach((b) => b.update(dt));
  checkCollisions();

  for (let i = bullets.length - 1; i >= 0; i--) {
    if (!bullets[i].alive) bullets.splice(i, 1);
  }

  if (player1.life <= 0 || player2.life <= 0) {
    gameOver = true;
    winner = player1.life > 0 ? "p1" : "p2";

	if (window.NexusGameSDK && nexusReady) {
    		const score = winner === "p1" ? player1.life : player2.life;
    		NexusGameSDK.submitScore(score, { winner, mode: currentScene });
  	}
  }

  p1LifeSpan.textContent = player1.life;
  p2LifeSpan.textContent = player2.life;
}

// Desenho da partida local
function drawLocalGame() {
  player1.draw(ctx);
  player2.draw(ctx);
  bullets.forEach((b) => b.draw(ctx));

  if (gameOver) {
    drawGameOver();
  }
}

// Atualização da partida vs BOT
function updateBotGame(dt) {
  if (gameOver) return;

  // Jogador humano (P1)
  player1.update(dt, bullets);

  // BOT (P2) controlado pelo BotBrain
  if (botBrain) {
    botBrain.update(dt);
  } else {
    player2.update(dt, bullets);
  }

  bullets.forEach((b) => b.update(dt));
  checkCollisions();

  for (let i = bullets.length - 1; i >= 0; i--) {
    if (!bullets[i].alive) bullets.splice(i, 1);
  }

  if (player1.life <= 0 || player2.life <= 0) {
    gameOver = true;
    winner = player1.life > 0 ? "p1" : "p2";
  }

  p1LifeSpan.textContent = player1.life;
  p2LifeSpan.textContent = player2.life;
}

// Desenho da partida vs BOT
function drawBotGame() {
  player1.draw(ctx);
  player2.draw(ctx);
  bullets.forEach((b) => b.draw(ctx));

  if (gameOver) {
    drawGameOver();
  }
}

// Atualização de cenas
function update(dt) {
  switch (currentScene) {
    case "local":
      updateLocalGame(dt);
      break;
    case "bot":
      updateBotGame(dt);
      break;
    case "online":
      // lógica online futura
      break;
    case "menu":
    default:
      // nada a atualizar
      break;
  }
}

// Desenho de cenas
function draw() {
  drawBackground(ctx);

  switch (currentScene) {
    case "local":
      drawLocalGame()
      break;
    case "bot":
      drawBotGame();
      break;
    case "online":
      drawOnlineScene();
      break;
    case "menu":
    default:
      drawMenuScene();
      break;
  }
}

// Sistema de cenas
function showControlsOverlay(mode) {
  if (!controlsOverlayEl || !controlsContentEl) return;
  const showP2 = mode === "local";
  controlsContentEl.innerHTML = `
    <div class="controls-list">
      <div class="controls-row">
        <span class="controls-label">P1</span>
        <span class="key">W</span>
        <span class="key">A</span>
        <span class="key">S</span>
        <span class="key">D</span>
        <span class="key">F</span>
      </div>
      ${showP2 ? `
      <div class="controls-row">
        <span class="controls-label">P2</span>
        <span class="key">&uarr;</span>
        <span class="key">&larr;</span>
        <span class="key">&darr;</span>
        <span class="key">&rarr;</span>
        <span class="key">L</span>
      </div>` : ""}
    </div>
  `;
  controlsOverlayEl.style.display = "flex";
  controlsVisible = true;
}

function hideControlsOverlay() {
  if (!controlsOverlayEl) return;
  controlsOverlayEl.style.display = "none";
  controlsVisible = false;
}

function maybeDismissControls() {
  if (!controlsVisible) return;
  hideControlsOverlay();
}

window.addEventListener("keydown", maybeDismissControls);
canvas.addEventListener("pointerdown", maybeDismissControls);
function setScene(scene) {
  currentScene = scene;

  if (scene === "local") {
    // Jogo local: ambos humanos
    hudEl.style.display = "flex";
    mainMenuEl.style.display = "none";
    botMenuEl.style.display = "none";
    player1.setAsHuman();
    player2.setAsHuman();
    botBrain = null;
    resetGame();
    showControlsOverlay("local");
  } else if (scene === "menu") {
    hudEl.style.display = "none";
    mainMenuEl.style.display = "flex";
    botMenuEl.style.display = "none";
    hideControlsOverlay();
    botBrain = null;
  } else if (scene === "bot") {
    // vs BOT
    hudEl.style.display = "flex";
    mainMenuEl.style.display = "none";
    botMenuEl.style.display = "none";
    player1.setAsHuman();
    player2.setAsHuman();
    const botApi = window.BotAI || null;
    if (botApi && typeof botApi.createBotBrain === "function") {
      botBrain = botApi.createBotBrain(
        player2,
        () => player1,
        bullets,
        botDifficulty
      );
    } else {
      botBrain = null;
      console.warn("BotAI não encontrado. Verifique se bot.js foi carregado.");
    }
    resetGame();
    showControlsOverlay("bot");
  } else if (scene === "online") {
    hudEl.style.display = "none";
    mainMenuEl.style.display = "none";
    botMenuEl.style.display = "none";
    hideControlsOverlay();
    botBrain = null;
  }
}

// Controle de menus (cliques)
btnLocal.addEventListener("click", () => {
  setScene("local");
});

btnBot.addEventListener("click", () => {
  // abre menu de dificuldade do BOT
  mainMenuEl.style.display = "none";
  botMenuEl.style.display = "flex";
});

btnBotBack.addEventListener("click", () => {
  botMenuEl.style.display = "none";
  mainMenuEl.style.display = "flex";
});

botDiffButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const diff = btn.getAttribute("data-bot-diff");
    botDifficulty = diff || "medium";
    setScene("bot");
  });
});

btnOnline.addEventListener("click", () => {
  setScene("online");
});

// Loop principal
function gameLoop(timestamp) {
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

// Inicialização
setScene("menu");
requestAnimationFrame(gameLoop);
