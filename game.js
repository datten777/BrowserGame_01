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
const pointer = { active: false, id: null, x: 0, y: 0 };

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }
  keys.add(e.key.toLowerCase());

  if (e.key === 'Enter' || e.key === ' ') {
    if (game.state === 'title' || game.state === 'gameover') startGame();
  }
  if ((e.key.toLowerCase() === 'x' || e.key.toLowerCase() === 'b') && !e.repeat) {
    useBomb();
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
  if (game.state === 'paused') {
    game.state = 'playing';
    return;
  }
  const p = toCanvasCoords(e);
  if (hit({ x: p.x, y: p.y, r: 0 }, BOMB_BUTTON)) {
    useBomb();
    return;
  }
  pointer.active = true;
  pointer.id = e.pointerId;
  pointer.x = p.x;
  pointer.y = p.y;
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointer.active || e.pointerId !== pointer.id) return;
  const p = toCanvasCoords(e);
  pointer.x = p.x;
  pointer.y = p.y;
});
// ボムボタンを押した指を離しても、移動中の指の操作は続ける
const endPointer = (e) => {
  if (e.pointerId === pointer.id) pointer.active = false;
};
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
// 武器・ボム
// ------------------------------------------------------------
const MAX_LEVEL = 3;
const START_BOMBS = 3;
const MAX_BOMBS = 5;
const BOMB_DAMAGE = 10;
const BOMB_BUTTON = { x: W - 48, y: H - 56, r: 32 };

// 武器アイテムを取ると持ち替え。同じ武器を取るとレベルアップ(最大3)
const WEAPONS = {
  normal: { name: 'VULCAN', letter: 'V', color: '#fff6a0', cooldown: 0.1 },
  spread: { name: 'SPREAD', letter: 'S', color: '#ff9f43', cooldown: 0.16 },
  laser: { name: 'LASER', letter: 'L', color: '#5ee7ff', cooldown: 0.06 },
  homing: { name: 'HOMING', letter: 'H', color: '#d08bff', cooldown: 0.24 },
  wave: { name: 'WAVE', letter: 'W', color: '#7fffb2', cooldown: 0.13 },
};
const WEAPON_IDS = Object.keys(WEAPONS);

function addBullet(b) {
  game.bullets.push({ r: 4, dmg: 1, age: 0, ...b });
}

function fireWeapon(p) {
  const lv = p.level;
  const x = p.x;
  const y = p.y - 16;
  switch (p.weapon) {
    case 'normal': {
      // 平行に並ぶ連射弾。レベルで本数が増える
      const offsets = [[0], [-6, 6], [-10, 0, 10]][lv - 1];
      for (const o of offsets) addBullet({ kind: 'normal', x: x + o, y, vx: 0, vy: -650 });
      break;
    }
    case 'spread': {
      // 扇状に広がる弾。レベルで 3 / 5 / 7 方向
      const ways = lv * 2 + 1;
      for (let i = 0; i < ways; i++) {
        const a = (i - (ways - 1) / 2) * 0.16;
        addBullet({ kind: 'spread', x, y, vx: Math.sin(a) * 560, vy: -Math.cos(a) * 560 });
      }
      break;
    }
    case 'laser': {
      // 敵を貫通する細いビーム。レベルで威力アップ
      addBullet({ kind: 'laser', x, y, vx: 0, vy: -950, r: 5, dmg: 0.4 + lv * 0.2, pierce: true, hitIds: new Set() });
      break;
    }
    case 'homing': {
      // 近くの敵を追いかけるミサイル。レベルで 2 / 3 / 4 発
      const count = lv + 1;
      for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + (i - (count - 1) / 2) * 0.6;
        addBullet({ kind: 'homing', x, y, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, r: 5, dmg: 1.5 });
      }
      break;
    }
    case 'wave': {
      // 左右にうねりながら進む大きめの弾。レベルで本数が増える
      const phases = [[0], [0, Math.PI], [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]][lv - 1];
      for (const phase of phases) {
        addBullet({ kind: 'wave', x, y, baseX: x, vx: 0, vy: -480, r: 7, phase });
      }
      break;
    }
  }
}

function updateBullets(dt) {
  for (const b of game.bullets) {
    b.age += dt;
    if (b.kind === 'homing') {
      // 一番近い敵へ少しずつ向きを変える
      let target = null;
      let best = Infinity;
      for (const e of game.enemies) {
        const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
        if (e.hp > 0 && d < best) {
          best = d;
          target = e;
        }
      }
      const speed = 420;
      let angle = Math.atan2(b.vy, b.vx);
      if (target) {
        const want = Math.atan2(target.y - b.y, target.x - b.x);
        let diff = want - angle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        angle += clamp(diff, -6 * dt, 6 * dt);
      }
      b.vx = Math.cos(angle) * speed;
      b.vy = Math.sin(angle) * speed;
    }
    if (b.kind === 'wave') {
      b.y += b.vy * dt;
      b.x = b.baseX + Math.sin(b.age * 12 + b.phase) * 40;
    } else {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
  }
}

function useBomb() {
  const p = game.player;
  if (game.state !== 'playing' || p.bombs <= 0 || game.bombFx > 0) return;
  p.bombs -= 1;
  p.invincible = Math.max(p.invincible, 1.5);
  game.bombFx = 0.8;
  game.bombOrigin = { x: p.x, y: p.y };
  game.shake = 0.5;
  // 敵弾はすべて消える
  for (const b of game.enemyBullets) explode(b.x, b.y, '#ff6b9a', 3);
  game.enemyBullets = [];
  // 画面内の敵全員にダメージ
  for (const e of game.enemies) {
    if (e.y > -e.r) damageEnemy(e, BOMB_DAMAGE);
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
  bombFx: 0, // ボム演出の残り時間(秒)
  bombOrigin: { x: 0, y: 0 },
  player: null,
  bullets: [],
  enemyBullets: [],
  enemies: [],
  particles: [],
  items: [],
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
    weapon: 'normal',
    level: 1,
    bombs: START_BOMBS,
  };
}

function startGame() {
  game.state = 'playing';
  game.score = 0;
  game.time = 0;
  game.spawnTimer = 1;
  game.shake = 0;
  game.bombFx = 0;
  game.player = createPlayer();
  game.bullets = [];
  game.enemyBullets = [];
  game.enemies = [];
  game.particles = [];
  game.items = [];
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
  p.fireCooldown -= dt;

  // スペース / Z / タッチ中は連射
  const firing = keys.has(' ') || keys.has('z') || pointer.active;
  if (firing && p.fireCooldown <= 0) {
    p.fireCooldown = WEAPONS[p.weapon].cooldown;
    fireWeapon(p);
  }
}

function damagePlayer() {
  const p = game.player;
  if (p.invincible > 0) return;
  p.lives -= 1;
  p.invincible = 2;
  // やられると武器レベルが 1 下がり、ボムは初期数まで補充
  p.level = Math.max(1, p.level - 1);
  p.bombs = Math.max(p.bombs, START_BOMBS);
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

const BOMB_ITEM_COLOR = '#ff5470';

function dropItem(x, y) {
  // 5回に1回はボム、それ以外はランダムな武器
  const kind = Math.random() < 0.2 ? 'bomb' : WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)];
  game.items.push({ kind, x, y, r: 11, age: 0 });
}

function updateItems(dt) {
  const p = game.player;
  for (const u of game.items) {
    u.y += 90 * dt;
    u.age += dt;
    if (hit(u, p)) {
      u.taken = true;
      game.score += 50;
      if (u.kind === 'bomb') {
        p.bombs = Math.min(MAX_BOMBS, p.bombs + 1);
        explode(u.x, u.y, BOMB_ITEM_COLOR, 12);
      } else {
        if (u.kind === p.weapon) {
          p.level = Math.min(MAX_LEVEL, p.level + 1);
        } else {
          p.weapon = u.kind;
        }
        explode(u.x, u.y, WEAPONS[u.kind].color, 12);
      }
    }
  }
  game.items = game.items.filter((u) => !u.taken && u.y < H + 20);
}

function damageEnemy(e, dmg) {
  if (e.hp <= 0) return;
  e.hp -= dmg;
  e.flash = 0.08;
  if (e.hp <= 0) {
    const def = ENEMY_TYPES[e.type];
    game.score += def.score;
    explode(e.x, e.y, def.color, e.type === 'gunner' ? 30 : 16);
    if (Math.random() < (e.type === 'gunner' ? 0.6 : 0.08)) dropItem(e.x, e.y);
  }
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
  game.bombFx = Math.max(0, game.bombFx - dt);

  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    spawnEnemy();
    game.spawnTimer = rand(0.5, 1.1) / difficulty();
  }

  updatePlayer(dt);
  updateEnemies(dt);

  updateBullets(dt);
  for (const b of game.enemyBullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  // 自機弾 × 敵
  for (const b of game.bullets) {
    for (const e of game.enemies) {
      if (e.hp <= 0 || !hit(b, e)) continue;
      if (b.pierce) {
        // 貫通弾は同じ敵に一度だけ当たる
        if (b.hitIds.has(e)) continue;
        b.hitIds.add(e);
        damageEnemy(e, b.dmg);
      } else {
        b.dead = true;
        damageEnemy(e, b.dmg);
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
  // ホーミング弾が画面内を回り続けないよう寿命を設ける
  game.bullets = game.bullets.filter((b) => inside(b) && b.age < 3);
  game.enemyBullets = game.enemyBullets.filter(inside);
  game.enemies = game.enemies.filter((e) => e.hp > 0);

  updateItems(dt);
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

  ctx.fillStyle = '#6cf';
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(14, 14);
  ctx.lineTo(0, 8);
  ctx.lineTo(-14, 14);
  ctx.closePath();
  ctx.fill();

  // コックピットの色で今の武器がわかる
  ctx.fillStyle = WEAPONS[p.weapon].color;
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

  // 武器名とレベル
  const w = WEAPONS[p.weapon];
  ctx.fillStyle = w.color;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(w.name, W - 14 - MAX_LEVEL * 12, 56);
  for (let i = 0; i < MAX_LEVEL; i++) {
    ctx.fillStyle = i < p.level ? w.color : 'rgba(255,255,255,0.2)';
    ctx.fillRect(W - 14 - (MAX_LEVEL - i) * 12 + 3, 46, 8, 10);
  }

  // ボムボタン(残り数を表示)。キーボードでは X / B
  const bb = BOMB_BUTTON;
  const ready = p.bombs > 0 && game.bombFx <= 0;
  ctx.globalAlpha = ready ? 0.9 : 0.35;
  ctx.strokeStyle = BOMB_ITEM_COLOR;
  ctx.lineWidth = 3;
  ctx.fillStyle = 'rgba(255,84,112,0.18)';
  ctx.beginPath();
  ctx.arc(bb.x, bb.y, bb.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText('BOMB', bb.x, bb.y - 2);
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(`×${p.bombs}`, bb.x, bb.y + 16);
  ctx.globalAlpha = 1;
}

function drawBullet(b) {
  const color = WEAPONS[b.kind].color;
  ctx.fillStyle = color;
  switch (b.kind) {
    case 'normal':
      ctx.fillRect(b.x - 2, b.y - 8, 4, 14);
      break;
    case 'spread':
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'laser':
      ctx.fillRect(b.x - 2, b.y - 22, 4, 36);
      ctx.fillStyle = '#fff';
      ctx.fillRect(b.x - 1, b.y - 22, 2, 36);
      break;
    case 'homing': {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.fillRect(-7, -2.5, 12, 5);
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(-10, -1.5, 3, 3);
      ctx.restore();
      break;
    }
    case 'wave':
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.r + 3, b.r - 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
  }
}

function drawItem(u) {
  const isBomb = u.kind === 'bomb';
  const color = isBomb ? BOMB_ITEM_COLOR : WEAPONS[u.kind].color;
  const r = u.r + Math.sin(u.age * 8) * 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (isBomb) {
    ctx.arc(u.x, u.y, r, 0, Math.PI * 2);
  } else {
    // 武器アイテムはひし形
    ctx.moveTo(u.x, u.y - r - 2);
    ctx.lineTo(u.x + r, u.y);
    ctx.lineTo(u.x, u.y + r + 2);
    ctx.lineTo(u.x - r, u.y);
    ctx.closePath();
  }
  ctx.fill();
  ctx.fillStyle = '#05060f';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(isBomb ? 'B' : WEAPONS[u.kind].letter, u.x, u.y + 4);
}

function drawBombFx() {
  if (game.bombFx <= 0) return;
  const t = 1 - game.bombFx / 0.8; // 0 → 1
  ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - t)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = `rgba(255,120,150,${1 - t})`;
  ctx.lineWidth = 14 * (1 - t) + 2;
  ctx.beginPath();
  ctx.arc(game.bombOrigin.x, game.bombOrigin.y, t * H * 1.1, 0, Math.PI * 2);
  ctx.stroke();
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
    drawCenteredText('ボム: X / B', H / 2 + 56, 18);
    drawCenteredText('一時停止: P', H / 2 + 84, 18);
    drawCenteredText('スマホ: ドラッグで移動・BOMBボタン', H / 2 + 112, 18);
    drawCenteredText('◆アイテムで武器チェンジ / 同じ武器でレベルアップ', H / 2 + 148, 15, '#aaa');
    WEAPON_IDS.forEach((id, i) => {
      const w = WEAPONS[id];
      ctx.fillStyle = w.color;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(w.name, W / 2 + (i - 2) * 86, H / 2 + 172);
    });
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      drawCenteredText('ENTER / タップでスタート', H / 2 + 225, 22, '#ffb347');
    }
    if (game.highScore > 0) drawCenteredText(`HIGH SCORE ${game.highScore}`, H - 40, 16, '#aaa');
    ctx.restore();
    return;
  }

  for (const u of game.items) drawItem(u);

  for (const e of game.enemies) drawEnemy(e);

  for (const b of game.bullets) drawBullet(b);

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

  drawBombFx();
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
