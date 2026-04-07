// Este arquivo concentra configuração e tomada de decisão das naves controladas por IA.

(function () {
  const clampValue = (v, min, max) => Math.max(min, Math.min(max, v));
  const randRange = (min, max) => min + Math.random() * (max - min);

  const botConfigs = {
    easy: {
      label: "Facil",
      moveSpeed: 210,
      shootCooldown: 0.55,
      aimTolerance: 70,
      aimJitter: 30,
      fireRate: 0.7,
      anchorX: 0.68,
      prediction: 0.2,
      dodgeRadius: 140,
      dodgeLookAhead: 1,
      dodgeStrength: 0.55,
      strafeIntensity: 0.3,
      microStrafe: 0.07,
      strafeInterval: [1.2, 1.8],
      burstCount: 1,
      burstSpread: 0,
      bulletSpeed: 480,
      maxAccumulator: 2,
    },
    medium: {
      label: "Medio",
      moveSpeed: 270,
      shootCooldown: 0.45,
      aimTolerance: 42,
      aimJitter: 18,
      fireRate: 1,
      anchorX: 0.72,
      prediction: 0.45,
      dodgeRadius: 180,
      dodgeLookAhead: 1.2,
      dodgeStrength: 0.85,
      strafeIntensity: 0.55,
      microStrafe: 0.1,
      strafeInterval: [0.95, 1.35],
      burstCount: 2,
      burstSpread: 10,
      bulletSpeed: 520,
      maxAccumulator: 2.2,
    },
    hard: {
      label: "Dificil",
      moveSpeed: 330,
      shootCooldown: 0.32,
      aimTolerance: 26,
      aimJitter: 10,
      fireRate: 1.45,
      anchorX: 0.76,
      prediction: 0.7,
      dodgeRadius: 230,
      dodgeLookAhead: 1.35,
      dodgeStrength: 1.2,
      strafeIntensity: 0.75,
      microStrafe: 0.13,
      strafeInterval: [0.65, 1],
      burstCount: 3,
      burstSpread: 12,
      bulletSpeed: 570,
      maxAccumulator: 2.4,
    },
    insane: {
      label: "Insano",
      moveSpeed: 380,
      shootCooldown: 0.25,
      aimTolerance: 18,
      aimJitter: 6,
      fireRate: 1.9,
      anchorX: 0.8,
      prediction: 0.95,
      dodgeRadius: 270,
      dodgeLookAhead: 1.45,
      dodgeStrength: 1.35,
      strafeIntensity: 0.9,
      microStrafe: 0.16,
      strafeInterval: [0.5, 0.85],
      burstCount: 4,
      burstSpread: 14,
      bulletSpeed: 620,
      maxAccumulator: 2.6,
    },
  };

  class BotBrain {
    constructor(ship, targetGetter, bullets, difficultyKey = "medium") {
      this.ship = ship;
      this.targetGetter = targetGetter;
      this.bullets = bullets;
      this.canvas = document.getElementById("game-canvas");
      this.fireAccumulator = 0;
      this.strafeDir = Math.random() > 0.5 ? 1 : -1;
      this.strafeTimer = 0;
      this.setDifficulty(difficultyKey);
      this.reset();
    }

    setDifficulty(key) {
      this.config = botConfigs[key] || botConfigs.medium;
      this.difficultyKey = key;
    }

    reset() {
      const cfg = this.config;
      this.ship.speed = cfg.moveSpeed;
      this.ship.shootCooldown = cfg.shootCooldown;
      this.ship.canShoot = true;
      this.ship.shootTimer = 0;
      this.ship.syncPosition();
      this.fireAccumulator = 0;
      this.strafeDir = Math.random() > 0.5 ? 1 : -1;
      this.strafeTimer = randRange(cfg.strafeInterval[0], cfg.strafeInterval[1]);
    }

    update(dt) {
      const target = this.targetGetter ? this.targetGetter() : null;
      if (!target || !this.canvas) return;
      const cfg = this.config;
      const ship = this.ship;
      const canvas = this.canvas;

      ship.speed = cfg.moveSpeed;

      // Troca de padrão de strafe periodicamente
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeDir = Math.random() > 0.5 ? 1 : -1;
        this.strafeTimer = randRange(cfg.strafeInterval[0], cfg.strafeInterval[1]);
      }

      // Verifica bala mais perigosa (linha de tiro do player)
      let vx = 0;
      let vy = 0;
      const threat = this.bullets.reduce((closest, b) => {
        if (!b.alive || b.owner === ship.id) return closest;

        const dx = ship.x - b.x;
        const dy = ship.y - b.y;
        const relSpeedX = b.vx * b.speed;
        const timeToBot = relSpeedX !== 0 ? dx / relSpeedX : Infinity;
        const samePath = timeToBot >= 0 && timeToBot <= cfg.dodgeLookAhead;
        if (!samePath || Math.abs(dy) > cfg.dodgeRadius) return closest;

        if (!closest || timeToBot < closest.time) {
          return { bullet: b, time: timeToBot, dy };
        }
        return closest;
      }, null);

      if (threat) {
        const dodgeDir = threat.dy >= 0 ? 1 : -1;
        vy += dodgeDir * cfg.dodgeStrength;
        vx -= 0.35;
      }

      // Busca alinhamento vertical
      const diffY = target.y - ship.y;
      if (Math.abs(diffY) > 6) {
        vy += Math.sign(diffY) * 0.75;
      }

      // Strafe vertical constante + micro ruído para imprevisibilidade
      vy += this.strafeDir * cfg.strafeIntensity;
      vx += (Math.random() - 0.5) * cfg.microStrafe;

      // Posicionamento horizontal (âncora) no lado direito
      const desiredX = canvas.width * cfg.anchorX;
      const diffX = desiredX - ship.x;
      if (Math.abs(diffX) > 6) {
        vx += Math.sign(diffX) * 0.7;
      }

      // Normaliza direção
      const len = Math.hypot(vx, vy);
      if (len > 1) {
        vx /= len;
        vy /= len;
      }

      ship.x += vx * ship.speed * dt;
      ship.y += vy * ship.speed * dt;

      ship.x = clampValue(ship.x, ship.radius, canvas.width - ship.radius);
      ship.y = clampValue(ship.y, ship.radius, canvas.height - ship.radius);
      if (typeof ship.trackVelocity === "function") {
        ship.trackVelocity(dt);
      }

      ship.handleShootCooldown(dt);

      // Mira com predição e erro controlado por dificuldade
      this.fireAccumulator = Math.min(
        this.fireAccumulator + dt * cfg.fireRate,
        cfg.maxAccumulator || 2.5
      );
      const targetOnLeft = target.x < ship.x - 8;

      const horizontalDist = ship.x - target.x;
      const timeToHit = Math.max(0, horizontalDist / (cfg.bulletSpeed || 500));
      const predictedY = target.y + (target.velY || 0) * cfg.prediction * timeToHit;
      const aimError = (Math.random() - 0.5) * cfg.aimJitter;
      const aimedDiff = predictedY + aimError - ship.y;
      const aligned = Math.abs(aimedDiff) < cfg.aimTolerance;

      if (aligned && targetOnLeft && ship.canShoot && this.fireAccumulator >= 1) {
        this.fireBurst(cfg);
        ship.canShoot = false;
        ship.shootTimer = cfg.shootCooldown;
        this.fireAccumulator = 0;
      }
    }

    fireBurst(cfg) {
      const ship = this.ship;
      const dir = ship.id === "p1" ? 1 : -1;
      const count = cfg.burstCount || 1;
      const spread = cfg.burstSpread || 0;
      const speed = cfg.bulletSpeed || 500;

      for (let i = 0; i < count; i++) {
        const centerOffset = i - (count - 1) / 2;
        const yOffset = centerOffset * spread;
        this.bullets.push(
          new Bullet(
            ship.x + dir * (ship.radius + 4),
            ship.y + yOffset,
            dir,
            0,
            ship.id,
            speed
          )
        );
      }
    }
  }

  function createBotBrain(ship, targetGetter, bullets, difficultyKey) {
    return new BotBrain(ship, targetGetter, bullets, difficultyKey);
  }

  window.BotAI = {
    botConfigs,
    BotBrain,
    createBotBrain,
  };
})();
