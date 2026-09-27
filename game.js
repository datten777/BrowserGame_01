'use strict';

// ============================================================
// Star Blaster - 縦スクロールシューティング
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const HIGH_SCORE_KEY = 'starBlaster.highScore';

// ------------------------------------------------------------
// 入力
// ------------------------------------------------------------
const keys = new Set();
const pointer = { active: false, x: 0, y: 0 };

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }
  keys.add(e.key.toLowerCase());

  if (e.key === 'Enter' || e.key === ' ') {
    if (game.state === 'title' || game.state === 'gameover') startGame();
  }
  if (e.key.toLowerCase() === 'p' && (game.state === 'playing' || game.state === 'paused')) {
    game.state = game.state === 'playing' ? 'paused' : 'playing';
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => {
  keys.clear();
  if (game.state === 'playing') game.state = 'paused';
});

function toCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * W,
    y: ((e.clientY - rect.top) / rect.height) * H,
  };
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (game.state === 'title' || game.state === 'gameover') {
    startGame();
    return;
  }
  if (game.state === 'paused') game.state = 'playing';
  const p = toCanvasCoords(e);
  pointer.active = true;
  pointer.x = p.x;
  pointer.y = p.y;
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointer.active) return;
  const p = toCanvasCoords(e);
  pointer.x = p.x;
  pointer.y = p.y;
});
const endPointer = () => { pointer.active = false; };
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// ------------------------------------------------------------
// ユーティリティ
// ------------------------------------------------------------
const rand = (min, max) => Math.random() * (max - min) + min;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const hit = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.r + b.r;
  return dx * dx + dy * dy < r * r;
};

function loadHighScore() {
  try {
    return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveHighScore(v) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(v));
  } catch {
    // ストレージが使えない環境では保存しない
  }
}

// ------------------------------------------------------------
// ゲーム状態
// ------------------------------------------------------------
const game = {
  state: 'title', // title | playing | paused | gameover
  score: 0,
  highScore: loadHighScore(),
  time: 0,
  spawnTimer: 0,
  shake: 0,
  player: null,
  bullets: [],
  enemyBullets: [],
  enemies: [],
  particles: [],
  powerUps: [],
  stars: [],
};

for (let i = 0; i < 90; i++) {
  game.stars.push({ x: rand(0, W), y: rand(0, H), speed: rand(20, 140), size: rand(0.5, 2) });
}

function createPlayer() {
  return {
    x: W / 2,
    y: H - 90,
    r: 12,
    speed: 300,
    lives: 3,
    fireCooldown: 0,
    invincible: 2,
    power: 0, // パワーアップ残り時間(秒)
  };
}

function startGame() {
  game.state = 'playing';
  game.score = 0;
  game.time = 0;
  game.spawnTimer = 1;
  game.shake = 0;
  game.player = createPlayer();
  game.bullets = [];
  game.enemyBullets = [];
  game.enemies = [];
  game.particles = [];
  game.powerUps = [];
}

// 経過時間に応じて難易度を上げる
const difficulty = () => 1 + game.time / 40;

// ------------------------------------------------------------
// 敵
// ------------------------------------------------------------
const ENEMY_TYPES = {
  grunt: { r: 14, hp: 1, speed: 120, score: 100, color: '#ff5470' },
  zigzag: { r: 13, hp: 2, speed: 100, score: 200, color: '#ffb347' },
  gunner: { r: 18, hp: 4, speed: 60, score: 400, color: '#b36bff' },
};

function spawnEnemy() {
  const d = difficulty();
  const roll = Math.random();
  let type = 'grunt';
  if (game.time > 20 && roll < 0.2) type = 'gunner';
  else if (game.time > 8 && roll < 0.5) type = 'zigzag';

  const def = ENEMY_TYPES[type];
  game.enemies.push({
    type,
    x: rand(def.r + 10, W - def.r - 10),
    y: -def.r,
    baseX: 0,
    r: def.r,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed * (0.8 + d * 0.2),
    age: 0,
    fireTimer: rand(0.8, 1.6),
    flash: 0,
  });
  const e = game.enemies[game.enemies.length - 1];
  e.baseX = e.x;
}

function updateEnemies(dt) {
  const p = game.player;
  for (const e of game.enemies) {
    e.age += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.y += e.speed * dt;

    if (e.type === 'zigzag') {
      e.x = clamp(e.baseX + Math.sin(e.age * 3) * 70, e.r, W - e.r);
    }
    if (e.type === 'gunner') {
      // 画面上部で停止して撃ってくる
      if (e.y > 140) e.y = 140 + Math.sin(e.age) * 10;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && p) {
        e.fireTimer = 1.4 / Math.sqrt(difficulty());
        const angle = Math.atan2(p.y - e.y, p.x - e.x);
        for (const offset of [-0.2, 0, 0.2]) {
          game.enemyBullets.push({
            x: e.x,
            y: e.y,
            vx: Math.cos(angle + offset) * 180,
            vy: Math.sin(angle + offset) * 180,
            r: 5,
          });
        }
      }
      // 一定時間たったら去っていく
      if (e.age > 10) e.y += 200 * dt;
    }
  }
  game.enemies = game.enemies.filter((e) => e.y < H + 40 && e.hp > 0);
}

// ------------------------------------------------------------
// プレイヤー
// ------------------------------------------------------------
function updatePlayer(dt) {
  const p = game.player;
  let dx = 0;
  let dy = 0;
  if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
  if (keys.has('arrowright') || keys.has('d')) dx += 1;
  if (keys.has('arrowup') || keys.has('w')) dy -= 1;
  if (keys.has('arrowdown') || keys.has('s')) dy += 1;

  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    p.x += (dx / len) * p.speed * dt;
    p.y += (dy / len) * p.speed * dt;
  } else if (pointer.active) {
    // タッチ時は指の少し上に機体が来るように追従
    const tx = pointer.x;
    const ty = pointer.y - 60;
    const step = p.speed * 1.6 * dt;
    const dist = Math.hypot(tx - p.x, ty - p.y);
    if (dist <= step) {
      p.x = tx;
      p.y = ty;
    } else {
      p.x += ((tx - p.x) / dist) * step;
      p.y += ((ty - p.y) / dist) * step;
    }
  }
  p.x = clamp(p.x, p.r, W - p.r);
  p.y = clamp(p.y, p.r + 40, H - p.r);

  p.invincible = Math.max(0, p.invincible - dt);
  p.power = Math.max(0, p.power - dt);
  p.fireCooldown -= dt;

  // スペース / Z / タッチ中は連射
  const firing = keys.has(' ') || keys.has('z') || pointer.active;
  if (firing && p.fireCooldown <= 0) {
    p.fireCooldown = 0.12;
    const spread = p.power > 0 ? [-0.18, 0, 0.18] : [0];
    for (const a of spread) {
      game.bullets.push({
        x: p.x,
        y: p.y - 16,
        vx: Math.sin(a) * 600,
        vy: -Math.cos(a) * 600,
        r: 4,
      });
    }
  }
}

function damagePlayer() {
  const p = game.player;
  if (p.invincible > 0) return;
  p.lives -= 1;
  p.invincible = 2;
  p.power = 0;
  game.shake = 0.4;
  explode(p.x, p.y, '#6cf', 30);
  if (p.lives <= 0) {
    game.state = 'gameover';
    if (game.score > game.highScore) {
      game.highScore = game.score;
      saveHighScore(game.highScore);
    }
  }
}

// ------------------------------------------------------------
// エフェクト・アイテム
// ------------------------------------------------------------
function explode(x, y, color, count = 16) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(40, 260);
    game.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: rand(0.3, 0.8),
      maxLife: 0.8,
      color,
      size: rand(1.5, 3.5),
    });
  }
}

function updateParticles(dt) {
  for (const pt of game.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
    pt.life -= dt;
  }
  game.particles = game.particles.filter((pt) => pt.life > 0);
}

function updatePowerUps(dt) {
  const p = game.player;
  for (const u of game.powerUps) {
    u.y += 90 * dt;
    u.age += dt;
    if (hit(u, p)) {
      u.taken = true;
      p.power = 8;
      game.score += 50;
      explode(u.x, u.y, '#7fffb2', 12);
    }
  }
  game.powerUps = game.powerUps.filter((u) => !u.taken && u.y < H + 20);
}

// ------------------------------------------------------------
// 更新
// ------------------------------------------------------------
function update(dt) {
  for (const s of game.stars) {
    s.y += s.speed * dt * (game.state === 'playing' ? 1 : 0.3);
    if (s.y > H) {
      s.y = 0;
      s.x = rand(0, W);
    }
  }

  if (game.state === 'gameover') updateParticles(dt);
  if (game.state !== 'playing') return;

  game.time += dt;
  game.shake = Math.max(0, game.shake - dt);

  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    spawnEnemy();
    game.spawnTimer = rand(0.5, 1.1) / difficulty();
  }

  updatePlayer(dt);
  updateEnemies(dt);

  for (const b of game.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  for (const b of game.enemyBullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  // 自機弾 × 敵
  for (const b of game.bullets) {
    for (const e of game.enemies) {
      if (e.hp > 0 && hit(b, e)) {
        b.dead = true;
        e.hp -= 1;
        e.flash = 0.08;
        if (e.hp <= 0) {
          const def = ENEMY_TYPES[e.type];
          game.score += def.score;
          explode(e.x, e.y, def.color, e.type === 'gunner' ? 30 : 16);
          if (Math.random() < (e.type === 'gunner' ? 0.5 : 0.07)) {
            game.powerUps.push({ x: e.x, y: e.y, r: 10, age: 0 });
          }
        }
        break;
      }
    }
  }

  const p = game.player;
  // 敵 × 自機
  for (const e of game.enemies) {
    if (e.hp > 0 && hit(e, p)) {
      if (p.invincible <= 0) {
        e.hp = 0;
        explode(e.x, e.y, ENEMY_TYPES[e.type].color);
      }
      damagePlayer();
    }
  }
  // 敵弾 × 自機 (当たり判定は見た目より小さめ)
  for (const b of game.enemyBullets) {
    if (hit(b, { x: p.x, y: p.y, r: 5 })) {
      b.dead = true;
      damagePlayer();
    }
  }

  const inside = (b) => !b.dead && b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20;
  game.bullets = game.bullets.filter(inside);
  game.enemyBullets = game.enemyBullets.filter(inside);
  game.enemies = game.enemies.filter((e) => e.hp > 0);

  updatePowerUps(dt);
  updateParticles(dt);
}

// ------------------------------------------------------------
// 描画
// ------------------------------------------------------------
function drawShip(p) {
  if (p.invincible > 0 && Math.floor(p.invincible * 15) % 2 === 0) return;
  ctx.save();
  ctx.translate(p.x, p.y);

  // 噴射炎
  ctx.fillStyle = `hsl(${30 + Math.random() * 20}, 100%, 60%)`;
  ctx.beginPath();
  ctx.moveTo(-5, 12);
  ctx.lineTo(0, 20 + Math.random() * 8);
  ctx.lineTo(5, 12);
  ctx.fill();

  ctx.fillStyle = p.power > 0 ? '#7fffb2' : '#6cf';
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(14, 14);
  ctx.lineTo(0, 8);
  ctx.lineTo(-14, 14);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, -2, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(e) {
  const def = ENEMY_TYPES[e.type];
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.fillStyle = e.flash > 0 ? '#fff' : def.color;

  if (e.type === 'grunt') {
    ctx.beginPath();
    ctx.moveTo(0, e.r);
    ctx.lineTo(e.r, -e.r * 0.6);
    ctx.lineTo(-e.r, -e.r * 0.6);
    ctx.closePath();
    ctx.fill();
  } else if (e.type === 'zigzag') {
    ctx.rotate(e.age * 4);
    ctx.fillRect(-e.r * 0.75, -e.r * 0.75, e.r * 1.5, e.r * 1.5);
  } else {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      ctx.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r);
    }
    ctx.closePath();
    ctx.fill();
    // HP バー
    ctx.fillStyle = '#300';
    ctx.fillRect(-e.r, -e.r - 8, e.r * 2, 3);
    ctx.fillStyle = '#f66';
    ctx.fillRect(-e.r, -e.r - 8, (e.r * 2 * e.hp) / e.maxHp, 3);
  }
  ctx.restore();
}

function drawCenteredText(text, y, size, color = '#fff') {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, y);
}

function drawHud() {
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE ${game.score}`, 14, 28);
  ctx.textAlign = 'right';
  ctx.fillText(`HI ${Math.max(game.highScore, game.score)}`, W - 14, 28);

  const p = game.player;
  for (let i = 0; i < p.lives; i++) {
    ctx.fillStyle = '#6cf';
    ctx.beginPath();
    const x = 22 + i * 22;
    ctx.moveTo(x, 42);
    ctx.lineTo(x + 8, 58);
    ctx.lineTo(x - 8, 58);
    ctx.closePath();
    ctx.fill();
  }
  if (p.power > 0) {
    ctx.fillStyle = '#7fffb2';
    ctx.fillRect(W - 14 - p.power * 12, 44, p.power * 12, 6);
  }
}

function render() {
  ctx.save();
  if (game.shake > 0) {
    ctx.translate(rand(-6, 6) * game.shake, rand(-6, 6) * game.shake);
  }

  ctx.fillStyle = '#05060f';
  ctx.fillRect(-10, -10, W + 20, H + 20);

  for (const s of game.stars) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + s.speed / 200})`;
    ctx.fillRect(s.x, s.y, s.size, s.size * (1 + s.speed / 60));
  }

  if (game.state === 'title') {
    drawCenteredText('STAR BLASTER', H / 2 - 60, 44, '#6cf');
    drawCenteredText('移動: 矢印キー / WASD', H / 2, 18);
    drawCenteredText('ショット: スペース / Z', H / 2 + 28, 18);
    drawCenteredText('一時停止: P', H / 2 + 56, 18);
    drawCenteredText('スマホ: 画面をドラッグ', H / 2 + 84, 18);
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      drawCenteredText('ENTER / タップでスタート', H / 2 + 150, 22, '#ffb347');
    }
    if (game.highScore > 0) drawCenteredText(`HIGH SCORE ${game.highScore}`, H - 40, 16, '#aaa');
    ctx.restore();
    return;
  }

  for (const u of game.powerUps) {
    ctx.fillStyle = '#7fffb2';
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.r + Math.sin(u.age * 8) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#05060f';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('P', u.x, u.y + 4);
  }

  for (const e of game.enemies) drawEnemy(e);

  ctx.fillStyle = '#fff6a0';
  for (const b of game.bullets) ctx.fillRect(b.x - 2, b.y - 8, 4, 14);

  ctx.fillStyle = '#ff6b9a';
  for (const b of game.enemyBullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (game.state !== 'gameover') drawShip(game.player);

  for (const pt of game.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;

  drawHud();

  if (game.state === 'paused') {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);
    drawCenteredText('PAUSED', H / 2, 40);
    drawCenteredText('P / タップで再開', H / 2 + 40, 18);
  }

  if (game.state === 'gameover') {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);
    drawCenteredText('GAME OVER', H / 2 - 30, 44, '#ff5470');
    drawCenteredText(`SCORE ${game.score}`, H / 2 + 20, 24);
    if (game.score > 0 && game.score >= game.highScore) {
      drawCenteredText('NEW HIGH SCORE!', H / 2 + 54, 20, '#ffb347');
    }
    drawCenteredText('ENTER / タップでリトライ', H / 2 + 110, 20);
  }

  ctx.restore();
}

// ------------------------------------------------------------
// メインループ
// ------------------------------------------------------------
let last = performance.now();
function loop(now) {
  // タブ復帰時などの大きな飛びを防ぐ
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
