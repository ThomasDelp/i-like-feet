/* Alexandre & the Foot Princess — a vertical platformer.

   Alexandre bounces automatically; the player only steers left/right. The world
   is one tall column: y grows downward, so climbing means going negative. The
   camera only ever moves up, which is what makes falling behind fatal.
   Everything is drawn with canvas primitives — no image assets. */

const VIEW = { w: 480, h: 720 };
const GOAL = 5000;            // world pixels from the ground up to the princess
const GRAVITY = 0.42;
const JUMP = -12.6;           // apex ≈ 189px, so keep platform gaps under ~150
const MOVE_ACCEL = 0.62;
const MOVE_MAX = 5.4;
const FRICTION = 0.9;
const MAX_HP = 3;
const INVULN = 112;           // frames of mercy after an ongle connects

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

const sfx = {
  jump: () => beep(rand(420, 470), 0.09, 'square', 0.045),
  hurt: () => { beep(180, 0.18, 'sawtooth', 0.08); beep(120, 0.26, 'sawtooth', 0.06); },
  crack: () => beep(90, 0.12, 'triangle', 0.05),
  dead: () => { beep(240, 0.2, 'square', 0.07); setTimeout(() => beep(150, 0.35, 'square', 0.07), 160); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.22, 'triangle', 0.07), i * 130)),
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

let state = 'title';          // title | play | pause | dead | win
let player, platforms, nails, particles, backFeet;
let camY, groundY, goalY, best, shake, frames, nailTimer, endTimer;

function reset() {
  groundY = 0;
  goalY = groundY - GOAL;
  camY = groundY - VIEW.h * 0.45;

  player = {
    x: VIEW.w / 2, y: groundY - 40,
    w: 26, h: 40,
    vx: 0, vy: 0,
    face: 1, hp: MAX_HP, invuln: 0,
    squash: 0, blink: 0, peak: 0,
  };

  platforms = [{
    x: VIEW.w / 2 - 90, y: groundY, w: 180, type: 'ground', dead: false,
  }];
  nails = [];
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

    const width = rand(96 - t * 34, 128 - t * 40);
    const roll = Math.random();
    let type = 'normal';
    if (climbed > 900 && roll < 0.16 + t * 0.12) type = 'moving';
    else if (climbed > 1800 && roll < 0.32 + t * 0.14) type = 'fragile';

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
    top = next;
  }
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

/* ------------------------------------------------------------------ nails */

function spawnNail() {
  const climbed = player.peak * 10;
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
  const climbed = player.peak * 10;
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
    if (player.invuln === 0 && hitsPlayer(nail)) hurt(nail);
  }

  nails = nails.filter((n) => n.x > -60 && n.x < VIEW.w + 60 && n.y < camY + VIEW.h + 120 && !n.gone);
}

function hitsPlayer(nail) {
  const nx = clamp(nail.x, player.x - player.w / 2, player.x + player.w / 2);
  const ny = clamp(nail.y, player.y - player.h / 2, player.y + player.h / 2);
  return Math.hypot(nail.x - nx, nail.y - ny) < nail.r * 0.8;
}

function hurt(nail) {
  nail.gone = true;
  player.hp -= 1;
  player.invuln = INVULN;
  shake = 14;
  burst(nail.x, nail.y, 14, ['#ffd9c9', '#ff8fa3', '#ffe6b0']);
  if (player.hp <= 0) {
    sfx.dead();
    state = 'dead';
    endTimer = 0;
    saveBest();
  } else {
    sfx.hurt();
  }
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
  if (player.squash > 0) player.squash--;
  if (--player.blink < 0) player.blink = Math.round(rand(90, 240));

  player.peak = Math.max(player.peak, (groundY - player.h / 2 - player.y) / 10);

  // Camera only climbs.
  camY = Math.min(camY, player.y - VIEW.h * 0.55);

  if (player.y - camY > VIEW.h + 70) {
    sfx.dead();
    state = 'dead';
    endTimer = 0;
    player.hp = 0;
    saveBest();
  }
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
  if (plat.type === 'throne') win();
}

function win() {
  if (state === 'win') return;
  state = 'win';
  endTimer = 0;
  sfx.win();
  for (let i = 0; i < 5; i++) {
    burst(rand(60, VIEW.w - 60), goalY - rand(0, 120), 16,
      ['#ffd166', '#ff6f91', '#8be9fd', '#fdf6ef', '#c084fc'], 4.5);
  }
  saveBest();
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
  if (plat.type === 'throne') { top = '#ffd166'; side = '#c98f22'; }
  if (plat.cracking) { top = '#ff8f6b'; side = '#8c3d20'; }

  ctx.fillStyle = side;
  roundRect(plat.x, y, plat.w, h, 6);
  ctx.fill();
  ctx.fillStyle = top;
  roundRect(plat.x, y, plat.w, h - 4, 6);
  ctx.fill();

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
  drawParticles();
  for (const nail of nails) drawNail(nail);
  if (state !== 'dead' || player.hp > 0) drawPlayer();
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
      ['They take 1 HP out of 3.', 'dim'],
      '',
      ['← → or A / D to steer · he bounces by himself', 'dim'],
      ['press any key, or tap, to begin', 'big'],
    ]);
  } else if (state === 'pause') {
    panel([['PAUSED', 'big'], ['press P to continue', 'dim']]);
  } else if (state === 'dead') {
    panel([
      ['OUCH', 'title'],
      player.hp <= 0 ? 'The ongles got him.' : 'Alexandre fell into the void.',
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
    stepNails();
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

  if (event.code === 'KeyM') { muted = !muted; return; }
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
