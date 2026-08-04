/* Alexandre & the Foot Princess — a vertical platformer.

   Alexandre bounces automatically; the player only steers left/right. The world
   is one tall column: y grows downward, so climbing means going negative. The
   camera only ever moves up, which is what makes falling behind fatal.
   Everything is drawn with canvas primitives; the one asset is the cat's
   soundtrack in assets/. */

const VIEW = { w: 480, h: 720 };
const GOAL = 5000;            // world pixels from the ground up to the princess
const GRAVITY = 0.42;
const JUMP = -12.6;           // apex ≈ 189px, so keep platform gaps under ~150
const MOVE_ACCEL = 0.62;
const MOVE_MAX = 5.4;
const FRICTION = 0.9;
const MAX_HP = 3;
const INVULN = 112;           // frames of mercy after an ongle connects
const START_LIVES = 3;
const MAX_LIVES = 5;
const CLIPPER_TIME = 8 * 60;  // how long a nail clipper keeps ongles off him
const BOOST_VY = -20.5;       // Red Bull launch, ~2.5 platforms in one go
const REST_EVERY = 850;       // world px between checkpoint platforms
const DOWN_TIME = 78;         // frames of the "he's down" beat before respawning

// The Nvidia cutscene, in frames: feeding, flexing, then the ride up.
const CAT_FEED = 44;
const CAT_FLEX = 34;
const CAT_RIDE = 66;
const CAT_TOTAL = CAT_FEED + CAT_FLEX + CAT_RIDE;
const CAT_LIFT = 2000;        // 200 m in Nvidia's paws

const BONUS = {
  heart:   { label: '+1 HP',              spark: '#ff6f91', glow: 'rgba(255,111,145,.4)' },
  life:    { label: '1 UP',               spark: '#ffd166', glow: 'rgba(255,209,102,.4)' },
  clipper: { label: 'COUPE-ONGLES!',      spark: '#8bd7ff', glow: 'rgba(139,215,255,.4)' },
  boost:   { label: 'ÇA DONNE DES AILES!', spark: '#ffd166', glow: 'rgba(255,209,102,.4)' },
  cat:     { label: 'NVIDIA!',            spark: '#76b900', glow: 'rgba(118,185,0,.45)' },
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[(Math.random() * list.length) | 0];
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/* ---------------------------------------------------------------- audio */

let audioCtx = null;
let muted = false;

function beep(freq, duration, type = 'square', gain = 0.06) {
  if (muted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const vol = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    vol.gain.setValueAtTime(gain, audioCtx.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(vol).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch { /* no audio, no problem */ }
}

/* The cutscene's soundtrack. The clip runs ~7.5s and the scene ~2.4s, so it
   plays on over the resumed climb rather than being cut off mid-phrase; it only
   fades if the run ends, the player mutes, or another cat turns up. */
const catSound = new Audio('assets/nvidia.m4a');
catSound.preload = 'auto';
let catFade = null;

function playCatSound() {
  if (muted) return;
  clearInterval(catFade);
  try {
    catSound.currentTime = 0;
    catSound.volume = 1;
    catSound.play().catch(() => {});
  } catch { /* no soundtrack, still a good cat */ }
}

function stopCatSound() {
  clearInterval(catFade);
  try { catSound.pause(); } catch { /* nothing to stop */ }
}

function fadeCatSound() {
  clearInterval(catFade);
  catFade = setInterval(() => {
    catSound.volume = Math.max(0, catSound.volume - 0.08);
    if (catSound.volume <= 0.01) {
      clearInterval(catFade);
      stopCatSound();
    }
  }, 40);
}

const sfx = {
  jump: () => beep(rand(420, 470), 0.09, 'square', 0.045),
  hurt: () => { beep(180, 0.18, 'sawtooth', 0.08); beep(120, 0.26, 'sawtooth', 0.06); },
  crack: () => beep(90, 0.12, 'triangle', 0.05),
  dead: () => { beep(240, 0.2, 'square', 0.07); setTimeout(() => beep(150, 0.35, 'square', 0.07), 160); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.22, 'triangle', 0.07), i * 130)),
  pickup: () => { beep(660, 0.08, 'triangle', 0.06); setTimeout(() => beep(880, 0.1, 'triangle', 0.05), 70); },
  oneup: () => [784, 988, 1319].forEach((f, i) => setTimeout(() => beep(f, 0.13, 'triangle', 0.06), i * 90)),
  boost: () => { beep(300, 0.2, 'sawtooth', 0.05); setTimeout(() => beep(720, 0.18, 'triangle', 0.05), 90); },
  clip: () => beep(1500, 0.05, 'square', 0.045),
  check: () => { beep(523, 0.1, 'triangle', 0.06); setTimeout(() => beep(784, 0.16, 'triangle', 0.06), 90); },
};

/* ----------------------------------------------------------------- input */

const keys = new Set();
let touchDir = 0;

function steer() {
  let dir = touchDir;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) dir -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) dir += 1;
  return clamp(dir, -1, 1);
}

/* ----------------------------------------------------------------- state */

let state = 'title';          // title | play | pause | cat | downed | dead | win
let player, platforms, nails, bonuses, toasts, particles, backFeet;
let camY, groundY, goalY, best, shake, frames, nailTimer, endTimer;
let lives, checkpoint, nextRest, downTimer, deathReason;
let catTimer, catFrom, catTarget;

function reset() {
  groundY = 0;
  goalY = groundY - GOAL;
  camY = groundY - VIEW.h * 0.45;

  player = {
    x: VIEW.w / 2, y: groundY - 40,
    w: 26, h: 40,
    vx: 0, vy: 0,
    face: 1, hp: MAX_HP, invuln: 0, clipper: 0,
    squash: 0, blink: 0, peak: 0,
  };

  lives = START_LIVES;
  checkpoint = { x: VIEW.w / 2 - 90, y: groundY, w: 180, type: 'ground' };
  nextRest = groundY - REST_EVERY;
  downTimer = 0;
  deathReason = null;
  catTimer = 0;
  catFrom = 0;
  catTarget = 0;
  stopCatSound();

  platforms = [{ ...checkpoint, dead: false }];
  nails = [];
  bonuses = [];
  toasts = [];
  particles = [];
  shake = 0;
  frames = 0;
  nailTimer = 140;
  endTimer = 0;

  backFeet = Array.from({ length: 16 }, () => ({
    x: rand(0, VIEW.w),
    y: rand(-VIEW.h, VIEW.h),
    size: rand(22, 70),
    alpha: rand(0.09, 0.24),
    rot: rand(0, Math.PI * 2),
    spin: rand(-0.004, 0.004),
    glyph: pick(['🦶', '👣']),
  }));

  best = Number(localStorage.getItem('alexandre-best') || 0);
  buildPlatforms();
}

/* -------------------------------------------------------------- platforms */

/* Fill the column with platforms up to one screen above the camera. Difficulty
   rides on height: bigger gaps, narrower ledges, more moving/fragile ones. */
function buildPlatforms() {
  // If culling ever empties the column (only reachable by teleporting the
  // player), reseed from just below the camera instead of stalling forever.
  let top = platforms.length ? platforms[platforms.length - 1].y : camY + VIEW.h;
  const ceiling = camY - VIEW.h;

  while (top > ceiling) {
    const climbed = groundY - top;
    if (top <= goalY) break;

    const t = clamp(climbed / GOAL, 0, 1);
    const gap = rand(62 + t * 34, 104 + t * 44);
    const next = top - gap;

    if (next <= goalY) {
      platforms.push({ x: VIEW.w / 2 - 70, y: goalY, w: 140, type: 'throne', dead: false });
      top = goalY;
      break;
    }

    let width = rand(96 - t * 34, 128 - t * 40);
    let type = 'normal';
    if (next <= nextRest) {
      // A wide, safe checkpoint ledge every REST_EVERY pixels.
      type = 'rest';
      width = 132;
      nextRest = next - REST_EVERY;
    } else {
      const roll = Math.random();
      if (climbed > 900 && roll < 0.16 + t * 0.12) type = 'moving';
      else if (climbed > 1800 && roll < 0.32 + t * 0.14) type = 'fragile';
    }

    const plat = {
      x: rand(6, VIEW.w - width - 6), y: next, w: width, type, dead: false,
    };
    if (type === 'moving') {
      plat.home = plat.x;
      plat.range = rand(40, Math.max(45, VIEW.w - width - 12) / 2);
      plat.phase = rand(0, Math.PI * 2);
      plat.rate = rand(0.012, 0.026);
    }
    platforms.push(plat);
    maybeBonus(plat, climbed);
    top = next;
  }
}

/* Pickups ride above static platforms; on moving ones they'd drift out of sync.
   Rest ledges are generous, since reaching one is already an achievement. */
function maybeBonus(plat, climbed) {
  if (plat.type === 'moving') return;
  const roll = Math.random();
  let kind = null;

  if (plat.type === 'rest') {
    if (roll < 0.25) kind = 'heart';
    else if (roll < 0.35) kind = 'clipper';
  } else if (roll < 0.022) kind = 'boost';
  else if (roll < 0.042) kind = 'clipper';
  else if (roll < 0.062) kind = 'heart';
  else if (roll < 0.078 && climbed > 600) kind = 'cat';
  else if (roll < 0.085 && climbed > 1200) kind = 'life';

  if (!kind) return;
  bonuses.push({
    kind,
    x: clamp(plat.x + plat.w / 2, 26, VIEW.w - 26),
    y: plat.y - 34,
    r: 13,
    bob: rand(0, Math.PI * 2),
    taken: false,
  });
}

function stepPlatforms() {
  for (const plat of platforms) {
    if (plat.type === 'moving') {
      plat.phase += plat.rate;
      plat.x = clamp(plat.home + Math.sin(plat.phase) * plat.range, 4, VIEW.w - plat.w - 4);
    }
    if (plat.cracking > 0 && --plat.cracking === 0) plat.dead = true;
  }
  // Drop everything that has scrolled well below the view.
  platforms = platforms.filter((p) => !p.dead && p.y < camY + VIEW.h + 200);
}

/* ------------------------------------------------------------------ bonuses */

function stepBonuses() {
  for (const b of bonuses) {
    b.bob += 0.06;
    if (!b.taken && overlapsPlayer(b.x, b.y + Math.sin(b.bob) * 4, b.r)) collect(b);
  }
  bonuses = bonuses.filter((b) => !b.taken && b.y < camY + VIEW.h + 220);
}

function collect(b) {
  b.taken = true;
  let label = BONUS[b.kind].label;

  if (b.kind === 'heart') {
    if (player.hp < MAX_HP) {
      player.hp += 1;
      sfx.pickup();
    } else if (lives < MAX_LIVES) {
      // A spare heart with nothing to heal becomes a spare life.
      lives += 1;
      label = '+1 LIFE';
      sfx.oneup();
    } else {
      label = 'ALREADY PERFECT';
      sfx.pickup();
    }
  } else if (b.kind === 'life') {
    lives = Math.min(MAX_LIVES, lives + 1);
    if (lives === MAX_LIVES) label = 'MAX LIVES';
    sfx.oneup();
  } else if (b.kind === 'clipper') {
    player.clipper = CLIPPER_TIME;
    sfx.pickup();
  } else if (b.kind === 'boost') {
    player.vy = BOOST_VY;
    player.squash = 9;
    sfx.boost();
  } else if (b.kind === 'cat') {
    startCat();
  }

  burst(b.x, b.y, 13, ['#fdf6ef', BONUS[b.kind].spark], 3.2);
  toast(label, b.x, b.y - 14, BONUS[b.kind].spark);
}

/* --------------------------------------------------------------- Nvidia the cat

   Alexandre finds his cat, feeds it croquettes, and the cat — now enormous —
   carries him 200 m up the tower. Everything else freezes while it plays. */

function startCat() {
  state = 'cat';
  catTimer = 0;
  catFrom = player.y;
  catTarget = Math.max(goalY + 40, player.y - CAT_LIFT);
  player.vx = 0;
  player.vy = 0;
  player.invuln = INVULN;
  nails = [];
  playCatSound();
}

function stepCat() {
  catTimer++;

  if (catTimer === CAT_FEED) {
    sfx.pickup();
    shake = 10;
  }
  if (catTimer === CAT_FEED + CAT_FLEX) {
    sfx.boost();
    shake = 16;
    toast('+200 m', player.x, player.y - 70, '#76b900');
  }

  // The ride: both the cat and the camera climb, generating the tower as it goes.
  if (catTimer > CAT_FEED + CAT_FLEX) {
    const p = clamp((catTimer - CAT_FEED - CAT_FLEX) / CAT_RIDE, 0, 1);
    const eased = p * p * (3 - 2 * p);
    player.y = catFrom + (catTarget - catFrom) * eased;
    player.peak = Math.max(player.peak, (groundY - player.h / 2 - player.y) / 10);
    camY = player.y - VIEW.h * 0.55;
    buildPlatforms();
    if (catTimer % 2 === 0) {
      burst(player.x + rand(-16, 16), player.y + 42, 2, ['#76b900', '#d7ff8a', '#fdf6ef'], 1.4);
    }
  }

  if (catTimer >= CAT_TOTAL) {
    state = 'play';
    player.vy = 1;
    player.invuln = 80;
    nailTimer = Math.max(nailTimer, 100);
    burst(player.x, player.y, 22, ['#76b900', '#d7ff8a', '#fdf6ef'], 4.2);
  }
}

/* ------------------------------------------------------------------- toasts */

function toast(text, x, y, color) {
  toasts.push({ text, x: clamp(x, 52, VIEW.w - 52), y, color, age: 0, life: 72 });
}

function stepToasts() {
  for (const t of toasts) {
    t.age++;
    t.y -= 0.55;
  }
  toasts = toasts.filter((t) => t.age < t.life);
}

/* ------------------------------------------------------------------ nails */

function spawnNail() {
  const climbed = altitude() * 10;
  const t = clamp(climbed / GOAL, 0, 1);
  const fromLeft = Math.random() < 0.5;
  const speed = rand(2.1, 3.4) + t * 1.9;
  nails.push({
    x: fromLeft ? -24 : VIEW.w + 24,
    y: camY + rand(VIEW.h * 0.05, VIEW.h * 0.92),
    vx: fromLeft ? speed : -speed,
    vy: rand(-0.5, 0.7),
    r: rand(9, 13),
    rot: rand(0, Math.PI * 2),
    spin: rand(-0.16, 0.16),
  });
}

function stepNails() {
  const climbed = altitude() * 10;
  const t = clamp(climbed / GOAL, 0, 1);

  if (climbed > 260 && --nailTimer <= 0) {
    spawnNail();
    if (t > 0.55 && Math.random() < 0.32) spawnNail();   // late-game volleys
    nailTimer = Math.round(rand(72, 128) - t * 38);
  }

  for (const nail of nails) {
    nail.x += nail.vx;
    nail.y += nail.vy;
    nail.rot += nail.spin;
    if (nail.gone) continue;
    if (player.clipper > 0 && overlapsPlayer(nail.x, nail.y, nail.r + 14)) clip(nail);
    else if (player.invuln === 0 && hitsPlayer(nail)) hurt(nail);
  }

  nails = nails.filter((n) => n.x > -60 && n.x < VIEW.w + 60 && n.y < camY + VIEW.h + 120 && !n.gone);
}

/* Circle against Alexandre's body box — used for both ongles and pickups. */
function overlapsPlayer(x, y, r) {
  const nx = clamp(x, player.x - player.w / 2, player.x + player.w / 2);
  const ny = clamp(y, player.y - player.h / 2, player.y + player.h / 2);
  return Math.hypot(x - nx, y - ny) < r;
}

function hitsPlayer(nail) {
  return overlapsPlayer(nail.x, nail.y, nail.r * 0.8);
}

/* Clipped, not hurt: the nail clipper turns ongles into confetti. */
function clip(nail) {
  nail.gone = true;
  burst(nail.x, nail.y, 9, ['#8bd7ff', '#fdf6ef', '#c9e9ff'], 2.6);
  sfx.clip();
}

function hurt(nail) {
  nail.gone = true;
  player.hp -= 1;
  player.invuln = INVULN;
  shake = 14;
  burst(nail.x, nail.y, 14, ['#ffd9c9', '#ff8fa3', '#ffe6b0']);
  if (player.hp <= 0) downed('ongles');
  else sfx.hurt();
}

/* One life gone. If any remain he drops back to his last checkpoint. */
function downed(reason) {
  lives -= 1;
  deathReason = reason;
  player.hp = 0;
  player.clipper = 0;
  shake = 18;
  burst(player.x, player.y, 20, ['#ffd9c9', '#ff8fa3', '#fdf6ef'], 4.2);
  saveBest();

  if (lives <= 0) {
    state = 'dead';
    endTimer = 0;
    fadeCatSound();
    sfx.dead();
  } else {
    state = 'downed';
    downTimer = DOWN_TIME;
    sfx.hurt();
  }
}

/* Rebuild the column from the checkpoint up: whatever was there has long since
   been culled, so the climb above it is freshly generated. */
function respawn() {
  platforms = [{ ...checkpoint, dead: false }];
  nails = [];
  bonuses = [];
  nextRest = checkpoint.y - REST_EVERY;

  player.x = checkpoint.x + checkpoint.w / 2;
  player.y = checkpoint.y - player.h / 2 - 2;
  player.vx = 0;
  player.vy = 0;
  player.hp = MAX_HP;
  player.invuln = INVULN;
  nailTimer = 130;

  camY = checkpoint.y - VIEW.h * 0.55;
  buildPlatforms();
  toast('GO AGAIN', player.x, player.y - 46, '#8bffc8');
  state = 'play';
}

/* -------------------------------------------------------------- particles */

function burst(x, y, n, colors, spread = 3.4) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: rand(-spread, spread),
      vy: rand(-spread, spread * 0.6),
      life: rand(20, 46),
      age: 0,
      size: rand(2, 5),
      color: pick(colors),
      gravity: 0.12,
    });
  }
}

function stepParticles() {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.age++;
  }
  particles = particles.filter((p) => p.age < p.life);
}

/* ------------------------------------------------------------------ player */

function stepPlayer() {
  const dir = steer();
  if (dir !== 0) {
    player.vx += dir * MOVE_ACCEL;
    player.face = dir;
  } else {
    player.vx *= FRICTION;
  }
  player.vx = clamp(player.vx, -MOVE_MAX, MOVE_MAX);
  player.x += player.vx;

  // Wrap around the sides, Doodle-Jump style.
  if (player.x < -player.w / 2) player.x = VIEW.w + player.w / 2;
  if (player.x > VIEW.w + player.w / 2) player.x = -player.w / 2;

  const prevBottom = player.y + player.h / 2;
  player.vy = Math.min(player.vy + GRAVITY, 17);
  player.y += player.vy;
  const bottom = player.y + player.h / 2;

  if (player.vy > 0) {
    for (const plat of platforms) {
      if (plat.dead) continue;
      const crossed = prevBottom <= plat.y && bottom >= plat.y;
      const overlaps = player.x + player.w / 2 > plat.x && player.x - player.w / 2 < plat.x + plat.w;
      if (crossed && overlaps) {
        land(plat);
        break;
      }
    }
  }

  if (player.invuln > 0) player.invuln--;
  if (player.clipper > 0) player.clipper--;
  if (player.squash > 0) player.squash--;
  if (player.vy < -15 && frames % 2 === 0) {
    burst(player.x, player.y + player.h / 2, 2, ['#ffd166', '#5b8def', 'rgba(255,255,255,.9)'], 1.2);
  }
  if (--player.blink < 0) player.blink = Math.round(rand(90, 240));

  player.peak = Math.max(player.peak, (groundY - player.h / 2 - player.y) / 10);

  // Camera only climbs.
  camY = Math.min(camY, player.y - VIEW.h * 0.55);

  if (player.y - camY > VIEW.h + 70) downed('fall');
}

function land(plat) {
  player.y = plat.y - player.h / 2;
  player.vy = JUMP;
  player.squash = 9;
  burst(player.x, plat.y, 5, ['rgba(255,255,255,.7)', '#e8c9ff'], 1.8);
  sfx.jump();

  if (plat.type === 'fragile' && !plat.cracking) {
    plat.cracking = 10;
    sfx.crack();
  }
  if (plat.type === 'rest' && plat.y < checkpoint.y) {
    checkpoint = { x: plat.x, y: plat.y, w: plat.w, type: 'rest' };
    toast('CHECKPOINT', player.x, plat.y - 34, '#8bffc8');
    sfx.check();
  }
  if (plat.type === 'throne') win();
}

function win() {
  if (state === 'win') return;
  state = 'win';
  endTimer = 0;
  fadeCatSound();
  sfx.win();
  for (let i = 0; i < 5; i++) {
    burst(rand(60, VIEW.w - 60), goalY - rand(0, 120), 16,
      ['#ffd166', '#ff6f91', '#8be9fd', '#fdf6ef', '#c084fc'], 4.5);
  }
  saveBest();
}

/* How high he is right now, in metres — this drives difficulty. */
function altitude() {
  return Math.max(0, (groundY - player.h / 2 - player.y) / 10);
}

/* Score is the highest point reached, in metres, so falling never rewinds it. */
function height() {
  return Math.max(0, Math.floor(player.peak));
}

function saveBest() {
  const climbed = height();
  if (climbed > best) {
    best = climbed;
    localStorage.setItem('alexandre-best', String(best));
  }
}

/* ------------------------------------------------------------------ drawing */

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW.h);
  const t = clamp((groundY - camY) / GOAL, 0, 1);       // sky lightens as he climbs
  grad.addColorStop(0, `hsl(${272 - t * 30}, 45%, ${9 + t * 16}%)`);
  grad.addColorStop(1, `hsl(${318 - t * 26}, 38%, ${16 + t * 20}%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  // Parallax feet, drifting and wrapping over a two-screen band.
  const band = VIEW.h * 2;
  for (const foot of backFeet) {
    foot.rot += foot.spin;
    let sy = foot.y - camY * 0.3;
    sy = ((sy % band) + band) % band - VIEW.h * 0.5;
    ctx.save();
    ctx.globalAlpha = foot.alpha;
    ctx.translate(foot.x, sy);
    ctx.rotate(foot.rot);
    ctx.font = `${foot.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(foot.glyph, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawPlatform(plat) {
  const y = plat.y - camY;
  if (y < -30 || y > VIEW.h + 30) return;
  const h = 12;

  let top = '#9d7be0';
  let side = '#5b3f96';
  if (plat.type === 'moving') { top = '#6fd3e8'; side = '#2f7f96'; }
  if (plat.type === 'fragile') { top = '#f3a26d'; side = '#a55b2c'; }
  if (plat.type === 'ground') { top = '#7d5aa8'; side = '#3c2a5c'; }
  if (plat.type === 'rest') { top = '#7ee0a8'; side = '#2f7d55'; }
  if (plat.type === 'throne') { top = '#ffd166'; side = '#c98f22'; }
  if (plat.cracking) { top = '#ff8f6b'; side = '#8c3d20'; }

  ctx.fillStyle = side;
  roundRect(plat.x, y, plat.w, h, 6);
  ctx.fill();
  ctx.fillStyle = top;
  roundRect(plat.x, y, plat.w, h - 4, 6);
  ctx.fill();

  if (plat.type === 'rest') {
    // little flag, so a checkpoint is obvious from a screen away
    ctx.strokeStyle = '#d9fff0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(plat.x + 12, y);
    ctx.lineTo(plat.x + 12, y - 15);
    ctx.stroke();
    ctx.fillStyle = '#8bffc8';
    ctx.beginPath();
    ctx.moveTo(plat.x + 12, y - 15);
    ctx.lineTo(plat.x + 25, y - 11);
    ctx.lineTo(plat.x + 12, y - 7);
    ctx.closePath();
    ctx.fill();
  }

  if (plat.type === 'fragile') {
    ctx.strokeStyle = 'rgba(80,30,10,.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      const x = plat.x + (plat.w / 4) * i;
      ctx.moveTo(x, y + 1);
      ctx.lineTo(x - 3, y + h - 3);
    }
    ctx.stroke();
  }
}

function drawNail(nail) {
  const y = nail.y - camY;
  if (y < -40 || y > VIEW.h + 40) return;
  const w = nail.r * 1.55;
  const h = nail.r * 2.1;

  ctx.save();
  ctx.translate(nail.x, y);
  ctx.rotate(nail.rot);

  const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  grad.addColorStop(0, '#fff3ea');
  grad.addColorStop(1, '#e0a091');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-w / 2, h * 0.28);
  ctx.quadraticCurveTo(-w / 2, -h / 2, 0, -h / 2);
  ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, h * 0.28);
  ctx.quadraticCurveTo(0, h * 0.62, -w / 2, h * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,60,55,.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.16, -h * 0.16, w * 0.14, h * 0.2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* A tiny bald-with-glasses head, used for the 1UP pickup and the lives counter. */
function drawFaceIcon(x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#f0c49b';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#241c33';
  ctx.lineWidth = 1.2;
  ctx.fillStyle = 'rgba(220,240,255,.6)';
  ctx.beginPath(); ctx.arc(-r * 0.38, 0, r * 0.34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(r * 0.38, 0, r * 0.34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.04, 0); ctx.lineTo(r * 0.04, 0);
  ctx.stroke();
  ctx.restore();
}

function drawBonus(b) {
  const y = b.y - camY + Math.sin(b.bob) * 4;
  if (y < -40 || y > VIEW.h + 40) return;

  ctx.save();
  ctx.translate(b.x, y);

  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
  glow.addColorStop(0, BONUS[b.kind].glow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.fill();

  if (b.kind === 'heart') {
    drawHeart(0, 2, 10, true);
  } else if (b.kind === 'life') {
    drawFaceIcon(0, 0, 9);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 13, b.bob, b.bob + Math.PI * 1.5);
    ctx.stroke();
  } else if (b.kind === 'clipper') {
    // nail clipper: chromed body, lever across the top, jaw at the bottom
    ctx.rotate(Math.sin(b.bob * 0.5) * 0.25);
    const metal = ctx.createLinearGradient(-6, 0, 6, 0);
    metal.addColorStop(0, '#9fb3cc');
    metal.addColorStop(0.45, '#ffffff');
    metal.addColorStop(1, '#8fa3bd');
    ctx.fillStyle = metal;
    roundRect(-5, -9, 10, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#dfe8f5';
    roundRect(-8, -12, 16, 4, 2);
    ctx.fill();
    ctx.fillStyle = '#8fa3bd';
    ctx.beginPath();
    ctx.moveTo(-5, 7); ctx.lineTo(0, 12); ctx.lineTo(5, 7);
    ctx.closePath();
    ctx.fill();
  } else if (b.kind === 'boost') {
    // energy drink: silver can, blue wedges, gold sun, two charging bulls
    ctx.rotate(Math.sin(b.bob * 0.6) * 0.16);
    const body = ctx.createLinearGradient(-7, 0, 7, 0);
    body.addColorStop(0, '#8e97a8');
    body.addColorStop(0.4, '#f2f5fa');
    body.addColorStop(1, '#98a2b3');
    ctx.fillStyle = body;
    roundRect(-6.5, -11, 13, 22, 3);
    ctx.fill();

    ctx.save();
    roundRect(-6.5, -11, 13, 22, 3);
    ctx.clip();
    ctx.fillStyle = '#20418f';
    ctx.beginPath();
    ctx.moveTo(-8, 3); ctx.lineTo(2, -13); ctx.lineTo(8, -13); ctx.lineTo(-8, 11);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-8, 15); ctx.lineTo(7, -2); ctx.lineTo(9, 5); ctx.lineTo(-2, 15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(0, 0, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c62828';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(dir * 0.8, -2.6); ctx.lineTo(dir * 5.4, -0.5); ctx.lineTo(dir * 0.8, 2.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = '#cfd6e2';
    roundRect(-5, -12.5, 10, 3, 1.5);
    ctx.fill();
  } else if (b.kind === 'cat') {
    drawCat(0, 6, 0.62, false, false);
  }

  ctx.restore();
}

/* Nvidia: grey tabby, green eyes, green collar. `buff` swaps in the arms he
   grows after eating, and the whole thing scales from one drawing. */
function drawCat(x, y, s, buff, mouthOpen) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineCap = 'round';

  // tail
  ctx.strokeStyle = '#7f8497';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(10, 6);
  ctx.quadraticCurveTo(25, 4, 21, -12);
  ctx.stroke();

  // body
  ctx.fillStyle = '#9aa0b5';
  ctx.beginPath();
  ctx.ellipse(0, 4, buff ? 18 : 12, buff ? 16 : 13, 0, 0, Math.PI * 2);
  ctx.fill();

  if (buff) {
    ctx.fillStyle = '#8b91a8';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(dir * 16, -7, 7.5, 12, dir * 0.45, 0, Math.PI * 2);   // bicep
      ctx.fill();
      ctx.beginPath();
      ctx.arc(dir * 21, -21, 5.5, 0, Math.PI * 2);                       // paw, holding him up
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.beginPath();
    ctx.ellipse(-6, 0, 6, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(6, 0, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#8b91a8';
    ctx.beginPath();
    ctx.ellipse(-6, 14, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(6, 14, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // head and ears
  const hy = buff ? -17 : -11;
  ctx.fillStyle = '#a8adc4';
  ctx.beginPath();
  ctx.moveTo(-10, hy - 5); ctx.lineTo(-12, hy - 18); ctx.lineTo(-2, hy - 10); ctx.closePath();
  ctx.moveTo(10, hy - 5); ctx.lineTo(12, hy - 18); ctx.lineTo(2, hy - 10); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e5a0b5';
  ctx.beginPath();
  ctx.moveTo(-9.5, hy - 7); ctx.lineTo(-10.6, hy - 14.5); ctx.lineTo(-5, hy - 10); ctx.closePath();
  ctx.moveTo(9.5, hy - 7); ctx.lineTo(10.6, hy - 14.5); ctx.lineTo(5, hy - 10); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#a8adc4';
  ctx.beginPath();
  ctx.arc(0, hy, 11, 0, Math.PI * 2);
  ctx.fill();

  // tabby stripes
  ctx.strokeStyle = '#8b91a8';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const dx of [-3.5, 0, 3.5]) {
    ctx.moveTo(dx, hy - 9.5);
    ctx.lineTo(dx, hy - 5.5);
  }
  ctx.stroke();

  // eyes
  ctx.fillStyle = '#76b900';
  ctx.beginPath();
  ctx.ellipse(-4.6, hy - 1, 2.6, 3.1, 0, 0, Math.PI * 2);
  ctx.ellipse(4.6, hy - 1, 2.6, 3.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1c2415';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-4.6, hy - 3.4); ctx.lineTo(-4.6, hy + 1.4);
  ctx.moveTo(4.6, hy - 3.4); ctx.lineTo(4.6, hy + 1.4);
  ctx.stroke();

  // nose, mouth, whiskers
  ctx.fillStyle = '#e5849b';
  ctx.beginPath();
  ctx.moveTo(-2, hy + 3); ctx.lineTo(2, hy + 3); ctx.lineTo(0, hy + 5.4);
  ctx.closePath();
  ctx.fill();
  if (mouthOpen) {
    ctx.fillStyle = '#5a2436';
    ctx.beginPath();
    ctx.ellipse(0, hy + 8, 3.6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const dir of [-1, 1]) {
    ctx.moveTo(dir * 4, hy + 4); ctx.lineTo(dir * 15, hy + 2);
    ctx.moveTo(dir * 4, hy + 5.5); ctx.lineTo(dir * 15, hy + 7);
  }
  ctx.stroke();

  // collar
  ctx.fillStyle = '#76b900';
  roundRect(-9.5, hy + 8.5, 19, 4, 2);
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(0, hy + 13.5, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBowl(x, y) {
  ctx.fillStyle = '#c98a4b';
  ctx.beginPath();
  ctx.arc(x, y - 3, 6.5, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#8b5a2b';
  ctx.beginPath();
  ctx.arc(x - 3, y - 5, 1.6, 0, Math.PI * 2);
  ctx.arc(x + 2.5, y - 6, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e7dbf0';
  ctx.beginPath();
  ctx.moveTo(x - 11, y - 3);
  ctx.quadraticCurveTo(x, y + 10, x + 11, y - 3);
  ctx.closePath();
  ctx.fill();
}

function caption(text, color) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 17px ui-rounded, system-ui, sans-serif';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(10,14,6,.85)';
  ctx.strokeText(text, VIEW.w / 2, VIEW.h - 84);
  ctx.fillStyle = color;
  ctx.fillText(text, VIEW.w / 2, VIEW.h - 84);
}

/* The three beats of the cutscene: croquettes, transformation, ascent. */
function drawCatScene() {
  const py = player.y - camY;

  const spot = ctx.createRadialGradient(player.x, py, 10, player.x, py, 200);
  spot.addColorStop(0, 'rgba(118,185,0,.20)');
  spot.addColorStop(1, 'rgba(4,8,2,.55)');
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  if (catTimer < CAT_FEED) {
    const munch = Math.floor(catTimer / 6) % 2 === 0;
    drawCat(player.x + 46, py + 14, 0.85, false, munch);
    drawBowl(player.x + 22, py + 26);
    if (catTimer % 7 === 0) {
      burst(player.x + 28, player.y + 8, 2, ['#8b5a2b', '#c98a4b'], 1.2);
    }
    caption('Croquettes pour Nvidia…', munch ? '#d7ff8a' : '#fdf6ef');
  } else if (catTimer < CAT_FEED + CAT_FLEX) {
    // He grows sideways out of Alexandre's way rather than through him.
    const p = (catTimer - CAT_FEED) / CAT_FLEX;
    const cx = clamp(player.x + 46 + p * 22, 60, VIEW.w - 60);
    ctx.strokeStyle = `rgba(118,185,0,${0.55 - p * 0.35})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, py + 14, 26 + p * 78, 0, Math.PI * 2);
    ctx.stroke();
    drawCat(cx, py + 14 + p * 16, 0.85 + p * 1.25, p > 0.3, false);
    caption('NVIDIA DEVIENT ÉNORME 💪', '#76b900');
  } else {
    // speed lines, then the cat holding him overhead
    ctx.strokeStyle = 'rgba(215,255,138,.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const sx = (i * 61 + 17) % VIEW.w;
      const sy = (i * 97 + catTimer * 34) % (VIEW.h + 120) - 60;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, sy + 44 + (i % 3) * 22);
    }
    ctx.stroke();
    drawCat(player.x, py + 100, 2.1, true, false);
    caption('+200 M EN UN SAUT', '#76b900');
  }
}

/* Shield ring while the clipper is live; it blinks out over the last second. */
function drawShield() {
  if (player.clipper <= 0) return;
  if (player.clipper < 60 && Math.floor(frames / 4) % 2 === 0) return;
  const pulse = 0.34 + Math.sin(frames * 0.16) * 0.12;
  ctx.strokeStyle = `rgba(139, 215, 255, ${pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(player.x, player.y - camY - 4, 27, 0, Math.PI * 2);
  ctx.stroke();
}

function drawToasts() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 14px ui-rounded, system-ui, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(12,7,18,.8)';
  for (const t of toasts) {
    const fade = t.age < 8 ? t.age / 8 : 1 - Math.max(0, (t.age - 44) / (t.life - 44));
    ctx.globalAlpha = clamp(fade, 0, 1);
    ctx.strokeText(t.text, t.x, t.y - camY);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y - camY);
  }
  ctx.globalAlpha = 1;
}

/* Alexandre: bald, glasses, sweater vest, permanently mid-hop. */
function drawPlayer() {
  const y = player.y - camY;
  const squash = player.squash > 0 ? player.squash / 9 : 0;
  const stretch = clamp(-player.vy / 26, 0, 0.22);
  const sx = 1 + squash * 0.24 - stretch;
  const sy = 1 - squash * 0.24 + stretch;
  const flicker = player.invuln > 0 && Math.floor(frames / 4) % 2 === 0;

  ctx.save();
  ctx.translate(player.x, y);
  ctx.globalAlpha = flicker ? 0.35 : 1;
  ctx.scale(player.face * sx, sy);

  // shadow-ish outline behind the body keeps him readable on bright platforms
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  roundRect(-12, -4, 24, 24, 8);
  ctx.fill();

  // legs
  ctx.strokeStyle = '#2d2440';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const kick = player.vy < 0 ? 4 : 9;
  ctx.beginPath();
  ctx.moveTo(-5, 14);
  ctx.lineTo(-7, 14 + kick);
  ctx.moveTo(5, 14);
  ctx.lineTo(8, 14 + kick - 2);
  ctx.stroke();
  ctx.strokeStyle = '#e9e3f5';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-9, 14 + kick);
  ctx.lineTo(-5, 14 + kick);
  ctx.moveTo(6, 12 + kick);
  ctx.lineTo(10, 12 + kick);
  ctx.stroke();

  // torso
  ctx.fillStyle = '#4f6fd0';
  roundRect(-10, -3, 20, 20, 7);
  ctx.fill();
  ctx.fillStyle = '#3a54a8';
  roundRect(-10, -3, 20, 8, 6);
  ctx.fill();

  // arms — up when rising, out when falling
  ctx.strokeStyle = '#f0c49b';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  if (player.vy < 0) {
    ctx.moveTo(-9, 2); ctx.lineTo(-14, -7);
    ctx.moveTo(9, 2); ctx.lineTo(14, -7);
  } else {
    ctx.moveTo(-9, 2); ctx.lineTo(-15, 6);
    ctx.moveTo(9, 2); ctx.lineTo(15, 6);
  }
  ctx.stroke();

  // head: bald dome with a highlight
  ctx.fillStyle = '#f0c49b';
  ctx.beginPath();
  ctx.arc(0, -12, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath();
  ctx.ellipse(-3.5, -18, 3.6, 2.2, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e0ae86';
  ctx.beginPath();
  ctx.arc(-11, -11, 2.6, 0, Math.PI * 2);
  ctx.arc(11, -11, 2.6, 0, Math.PI * 2);
  ctx.fill();

  // glasses
  ctx.strokeStyle = '#241c33';
  ctx.lineWidth = 1.8;
  ctx.fillStyle = 'rgba(220,240,255,.55)';
  ctx.beginPath(); ctx.arc(-4.4, -12, 4.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(4.4, -12, 4.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.3, -12); ctx.lineTo(0.3, -12);
  ctx.moveTo(-8.5, -13); ctx.lineTo(-11, -14);
  ctx.moveTo(8.5, -13); ctx.lineTo(11, -14);
  ctx.stroke();

  // eyes + a hopeful little smile
  ctx.fillStyle = '#241c33';
  const eyeH = player.blink < 6 ? 0.6 : 1.7;
  ctx.beginPath();
  ctx.ellipse(-4.4, -12, 1.5, eyeH, 0, 0, Math.PI * 2);
  ctx.ellipse(4.4, -12, 1.5, eyeH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a5a45';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, -6.5, 3.2, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.stroke();

  ctx.restore();
  ctx.globalAlpha = 1;
}

/* The Foot Princess: a regal foot, crowned, waiting at the summit. */
function drawPrincess() {
  const y = goalY - camY - 52 + Math.sin(frames * 0.045) * 5;
  if (y < -180 || y > VIEW.h + 180) return;

  ctx.save();
  ctx.translate(VIEW.w / 2 + 32, y);
  ctx.scale(1.15, 1.15);

  // glow
  const glow = ctx.createRadialGradient(0, 0, 8, 0, 0, 90);
  glow.addColorStop(0, 'rgba(255,209,102,.35)');
  glow.addColorStop(1, 'rgba(255,209,102,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 90, 0, Math.PI * 2);
  ctx.fill();

  // Sole, seen from underneath: ball + heel joined by a narrow arch, so the
  // silhouette reads as a footprint rather than a blob.
  ctx.fillStyle = '#f7c9a6';
  ctx.beginPath();
  ctx.ellipse(0, -6, 20, 16, 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(4, 22, 13.5, 14, 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-13, -2);
  ctx.quadraticCurveTo(-4, 10, -6, 22);
  ctx.lineTo(16, 22);
  ctx.quadraticCurveTo(18, 8, 15, -2);
  ctx.closePath();
  ctx.fill();

  // toes, big to small
  ctx.fillStyle = '#f9d5b6';
  const toes = [[-15, -24, 7], [-5, -29, 5.6], [4, -29, 4.8], [12, -26, 4], [18, -21, 3.3]];
  for (const [tx, ty, tr] of toes) {
    ctx.beginPath();
    ctx.arc(tx, ty, tr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ff8fb0';
  for (const [tx, ty, tr] of toes) {
    ctx.beginPath();
    ctx.ellipse(tx, ty - tr * 0.45, tr * 0.55, tr * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // crown
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(-15, -34);
  ctx.lineTo(-11, -47); ctx.lineTo(-5, -37);
  ctx.lineTo(1, -50); ctx.lineTo(7, -37);
  ctx.lineTo(13, -47); ctx.lineTo(16, -34);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff6f91';
  ctx.beginPath();
  ctx.arc(1, -42, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // face on the ball of the foot
  ctx.fillStyle = '#241c33';
  ctx.beginPath();
  ctx.arc(-6, -9, 2, 0, Math.PI * 2);
  ctx.arc(8, -9, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c2647a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(1, -5, 5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,143,176,.5)';
  ctx.beginPath();
  ctx.ellipse(-14, -5, 4, 2.6, 0, 0, Math.PI * 2);
  ctx.ellipse(16, -5, 4, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHud() {
  const climbed = height();
  const total = Math.floor(GOAL / 10);

  for (let i = 0; i < MAX_HP; i++) {
    drawHeart(20 + i * 26, 24, 9, i < player.hp);
  }

  // lives, as spare Alexandres
  drawFaceIcon(104, 20, 8);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fdf6ef';
  ctx.font = 'bold 14px ui-rounded, system-ui, sans-serif';
  ctx.fillText(`×${Math.max(0, lives)}`, 116, 21);

  // clipper timer
  if (player.clipper > 0) {
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    roundRect(14, 40, 76, 6, 3);
    ctx.fill();
    ctx.fillStyle = '#8bd7ff';
    roundRect(14, 40, 76 * (player.clipper / CLIPPER_TIME), 6, 3);
    ctx.fill();
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fdf6ef';
  ctx.font = 'bold 20px ui-rounded, system-ui, sans-serif';
  ctx.fillText(`${climbed} m`, VIEW.w - 16, 26);
  ctx.fillStyle = 'rgba(253,246,239,.6)';
  ctx.font = '12px ui-rounded, system-ui, sans-serif';
  ctx.fillText(`goal ${total} m · best ${best} m`, VIEW.w - 16, 43);

  // climb meter down the right edge
  const trackTop = 62;
  const trackH = VIEW.h - 100;
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  roundRect(VIEW.w - 12, trackTop, 5, trackH, 3);
  ctx.fill();
  const p = clamp(climbed / total, 0, 1);
  ctx.fillStyle = '#ff6f91';
  roundRect(VIEW.w - 12, trackTop + trackH * (1 - p), 5, trackH * p, 3);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = '12px ui-rounded, system-ui, sans-serif';
  ctx.fillText('👑', VIEW.w - 10, trackTop - 5);
  ctx.textAlign = 'right';

  if (muted) {
    ctx.fillStyle = 'rgba(253,246,239,.5)';
    ctx.font = '11px ui-rounded, system-ui, sans-serif';
    ctx.fillText('muted', VIEW.w - 16, VIEW.h - 14);
  }
}

function drawHeart(x, y, r, filled) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.75);
  ctx.bezierCurveTo(-r * 1.5, -r * 0.4, -r * 0.5, -r * 1.3, 0, -r * 0.5);
  ctx.bezierCurveTo(r * 0.5, -r * 1.3, r * 1.5, -r * 0.4, 0, r * 0.75);
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = '#ff6f91';
    ctx.fill();
  }
  ctx.strokeStyle = filled ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.28)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = 1 - p.age / p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - camY - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

/* Overlay text. `align: 'bottom'` and a lighter `dim` keep the summit reunion
   visible behind the winning message. */
function panel(lines, { dim = 0.72, align = 'center' } = {}) {
  ctx.fillStyle = `rgba(12, 7, 18, ${dim})`;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  const styleOf = (line) => (Array.isArray(line) ? line[1] : 'body');
  const blockH = lines.reduce((h, line) => h + (styleOf(line) === 'title' ? 58 : 26), 0);
  let y = align === 'bottom' ? VIEW.h - blockH - 46 : VIEW.h / 2 - blockH / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const line of lines) {
    const [text, style] = Array.isArray(line) ? line : [line, 'body'];
    if (style === 'title') {
      ctx.font = 'bold 34px ui-rounded, system-ui, sans-serif';
      ctx.fillStyle = '#ffb27a';
      y += 12;
    } else if (style === 'big') {
      ctx.font = 'bold 24px ui-rounded, system-ui, sans-serif';
      ctx.fillStyle = '#fdf6ef';
    } else if (style === 'dim') {
      ctx.font = '13px ui-rounded, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(253,246,239,.6)';
    } else {
      ctx.font = '15px ui-rounded, system-ui, sans-serif';
      ctx.fillStyle = '#e7dbf0';
    }
    ctx.fillText(text, VIEW.w / 2, y);
    y += style === 'title' ? 46 : 26;
  }
}

function draw() {
  ctx.save();
  if (shake > 0) {
    ctx.translate(rand(-shake, shake) * 0.4, rand(-shake, shake) * 0.4);
    shake -= 0.6;
  }

  drawBackground();
  drawPrincess();
  for (const plat of platforms) drawPlatform(plat);
  for (const bonus of bonuses) drawBonus(bonus);
  if (state === 'cat') drawCatScene();
  drawParticles();
  for (const nail of nails) drawNail(nail);
  if (state !== 'dead' && state !== 'downed') {
    drawPlayer();
    if (state !== 'cat') drawShield();
  }
  drawToasts();
  drawHud();
  ctx.restore();

  const climbed = height();
  const taken = MAX_HP - player.hp;
  const hits = `${taken} hit${taken === 1 ? '' : 's'}`;

  if (state === 'title') {
    panel([
      ['ALEXANDRE', 'title'],
      '…and the Foot Princess',
      '',
      'Climb 500 m. Dodge the flying ongles.',
      ['They take 1 HP out of 3 — and you have 3 lives.', 'dim'],
      ['Grab hearts, nail clippers and winged feet.', 'dim'],
      '',
      ['← → or A / D to steer · he bounces by himself', 'dim'],
      ['press any key, or tap, to begin', 'big'],
    ]);
  } else if (state === 'pause') {
    panel([['PAUSED', 'big'], ['press P to continue', 'dim']]);
  } else if (state === 'downed') {
    panel([
      [deathReason === 'fall' ? 'He fell.' : 'The ongles got him.', 'big'],
      [`${lives} ${lives === 1 ? 'life' : 'lives'} left`, 'body'],
      ['back to the last checkpoint…', 'dim'],
    ], { dim: 0.5, align: 'bottom' });
  } else if (state === 'dead') {
    panel([
      ['OUCH', 'title'],
      deathReason === 'fall' ? 'Alexandre fell into the void.' : 'The ongles finished him.',
      ['No lives left.', 'dim'],
      [`${climbed} m climbed · best ${best} m`, 'body'],
      '',
      'The Foot Princess waits still.',
      ['press R or tap to try again', 'big'],
    ]);
  } else if (state === 'win') {
    panel([
      ['SAVED! 👑', 'title'],
      'Alexandre reaches the Foot Princess.',
      'She was, in fact, also into glasses.',
      [`${climbed} m climbed · ${hits} taken`, 'dim'],
      '',
      ['press R or tap for another climb', 'big'],
    ], { dim: 0.4, align: 'bottom' });
  }
}

function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/* -------------------------------------------------------------------- loop */

function update() {
  frames++;
  if (state === 'play') {
    stepPlayer();
    stepPlatforms();
    buildPlatforms();
    stepBonuses();
    stepNails();
  } else if (state === 'cat') {
    stepCat();
    stepPlatforms();
  } else if (state === 'downed') {
    stepPlatforms();
    if (--downTimer <= 0) respawn();
  } else if (state === 'win' || state === 'dead') {
    endTimer++;
    stepPlatforms();
    if (state === 'win') {
      camY += (goalY - VIEW.h * 0.3 - camY) * 0.04;    // pan up to the princess
      player.x += (VIEW.w / 2 - 34 - player.x) * 0.06;  // shuffle over beside her
      if (endTimer % 34 === 0 && endTimer < 200) {
        burst(rand(60, VIEW.w - 60), camY + rand(80, 260), 12,
          ['#ffd166', '#ff6f91', '#8be9fd', '#fdf6ef'], 4);
      }
    }
  }
  stepParticles();
  stepToasts();
}

let last = performance.now();
let acc = 0;
const STEP = 1000 / 60;

function frame(now) {
  acc += Math.min(now - last, 250);
  last = now;
  while (acc >= STEP) {
    update();
    acc -= STEP;
  }
  draw();
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ events */

function start() {
  reset();
  state = 'play';
}

function onAction() {
  if (state === 'title') start();
  else if (state === 'dead' || state === 'win') start();
}

window.addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
  keys.add(event.code);

  if (event.code === 'KeyM') {
    muted = !muted;
    if (muted) stopCatSound();
    return;
  }
  if (event.code === 'KeyP') {
    if (state === 'play') state = 'pause';
    else if (state === 'pause') state = 'play';
    return;
  }
  if (event.code === 'KeyR') { start(); return; }
  if (state === 'title' || state === 'dead' || state === 'win') onAction();
});

window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); touchDir = 0; });

function pointerDir(event) {
  const rect = canvas.getBoundingClientRect();
  return event.clientX - rect.left < rect.width / 2 ? -1 : 1;
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.focus();
  if (state === 'downed' || state === 'cat') return;   // both resolve on their own
  if (state !== 'play' && state !== 'pause') { onAction(); return; }
  touchDir = pointerDir(event);
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (touchDir !== 0) touchDir = pointerDir(event);
});
canvas.addEventListener('pointerup', () => { touchDir = 0; });
canvas.addEventListener('pointercancel', () => { touchDir = 0; });

function setupCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = VIEW.w * dpr;
  canvas.height = VIEW.h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

setupCanvas();
window.addEventListener('resize', setupCanvas);
reset();
requestAnimationFrame(frame);
