/* Alexandre & Sabrina, the Foot Princess — a vertical platformer.

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
const INVULN = 112;           // frames of mercy after a razor connects
const START_LIVES = 3;
const MAX_LIVES = 5;
const CLIPPER_TIME = 8 * 60;  // how long a razor clipper keeps razors off him
const SPRING_VY = -20.5;      // trampoline launch, ~2.5 platforms in one go
const MID_REST = -GOAL / 2;   // the one and only checkpoint, halfway up
const DOWN_TIME = 78;         // frames of the "he's down" beat before respawning

// The Nvidia cutscene, in frames: feeding, flexing, then the ride up.
const CAT_FEED = 44;
const CAT_FLEX = 34;
const CAT_RIDE = 66;
const CAT_TOTAL = CAT_FEED + CAT_FLEX + CAT_RIDE;
const CAT_LIFT = 2000;        // 200 m in Nvidia's paws

// Uber Eats : une machine à sous, un plat, un pouvoir.
const WHEEL_SPIN = 80;        // frames de rotation de la roue
const WHEEL_HOLD = 30;        // frames d'arrêt sur le résultat
const JET_TIME = 3.4 * 60;    // propulsion au curry
const JET_MAX = -9;           // vitesse de montée maximale au pet
const NOODLE_USES = 3;        // grappins nouille
const GRAPPLE_FRAMES = 14;
const NOODLE_RANGE = 78;      // distance max entre le clic et une passerelle
const FRIES_TIME = 4.5 * 60;  // durée pendant laquelle il perd ses frites
const FRY_EVERY = 9;          // frames entre deux frites éjectées

// La crème pour le crâne : brèche dans le monde, thème de transcendance.
const TRANS_TIME = 12 * 60;
const GHOST_GAP = 78;         // au-delà, une passerelle intermédiaire apparaît
const CRACK_GROW = 40;        // frames d'apparition de la fracture

const MEALS = ['indien', 'nouilles', 'frites'];
const MEAL = {
  indien:   { label: '🍛 INDIEN — PROPULSION !',    spark: '#9ab53a' },
  nouilles: { label: '🍜 NOUILLES — SPIDER-ALEX !', spark: '#ffd166' },
  frites:   { label: '🍟 FRITES — ÇA GICLE !',      spark: '#ffd93b' },
};

const BONUS = {
  heart:   { label: '+1 RED BULL',      spark: '#ffd166', glow: 'rgba(255,209,102,.42)' },
  life:    { label: '1 VIE EN PLUS',    spark: '#ff6f91', glow: 'rgba(255,111,145,.4)' },
  clipper: { label: 'COUPE-ONGLES !',   spark: '#8bd7ff', glow: 'rgba(139,215,255,.4)' },
  cat:     { label: 'NVIDIA !',         spark: '#76b900', glow: 'rgba(118,185,0,.45)' },
  uber:    { label: 'UBER EATS !',      spark: '#06c167', glow: 'rgba(6,193,103,.42)' },
  creme:   { label: 'CRÈME POUR UN CRÂNE LUISANT !', spark: '#fff3c4', glow: 'rgba(255,246,205,.5)' },
};

/* --------------------------------------------------------------- les skins

   Une tenue par skin, plus ce qu'il faut débloquer pour y avoir droit. Le
   premier est offert ; les deux autres s'obtiennent en jouant. `test` est
   évalué au bon moment par unlock() — jamais en boucle de rendu. */

const SKINS = [
  {
    id: 'classique',
    name: 'Le classique',
    desc: 't-shirt noir, pantalon marron',
    shirt: '#2b2f36', collar: '#191c21', sleeves: true,
    trousers: '#8b5e34', shoes: '#e9e3f5',
  },
  {
    id: 'princesse',
    name: 'La princesse',
    desc: 'caleçon, ailes et couronne',
    bare: true,
    shorts: '#8ec9f0', shortsBand: '#4f9dcb', shortsDots: '#ffffff',
    trousers: '#f0c49b', shoes: '#ffd7e6',
    wings: true, crown: true,
    need: '250 m atteints',
    test: () => player.peak >= 250,
  },
  {
    id: 'mistral',
    name: 'Le super-héros',
    desc: 'slip de bain Mistral',
    bare: true, briefs: true,
    shorts: '#1f2b57', shortsBand: '#ffd166',
    trousers: '#f0c49b', shoes: '#c62828',
    logo: true,
    need: 'Sabrina sauvée, 0 vie perdue',
    test: () => state === 'win' && lives === START_LIVES,
  },
];

const SKIN = Object.fromEntries(SKINS.map((s) => [s.id, s]));
const FREE_SKIN = SKINS[0].id;

// Le dégradé du logo Mistral, du jaune au rouge, ligne par ligne.
const MISTRAL_BANDS = ['#ffd53e', '#ffaf2b', '#ff8a20', '#f9611b', '#e63413'];
// Le M, en 5 colonnes de 5 cases : 1 = case peinte.
const MISTRAL_M = [
  [1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0],
  [1, 1, 1, 0, 0],
  [1, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
];

let skin = FREE_SKIN;
let unlocked = new Set([FREE_SKIN]);

function loadSkins() {
  try {
    const saved = (localStorage.getItem('alexandre-skins') || '').split(',');
    unlocked = new Set([FREE_SKIN, ...saved.filter((id) => id in SKIN)]);
    const chosen = localStorage.getItem('alexandre-skin');
    skin = unlocked.has(chosen) ? chosen : FREE_SKIN;
  } catch { /* pas de stockage, pas de skins */ }
}

function saveSkins() {
  try {
    localStorage.setItem('alexandre-skins', [...unlocked].join(','));
    localStorage.setItem('alexandre-skin', skin);
  } catch { /* tant pis pour la prochaine fois */ }
}

/* Débloque un skin et le fait savoir. Idempotent : le second appel ne fait rien. */
function unlock(id) {
  if (unlocked.has(id)) return false;
  unlocked.add(id);
  saveSkins();
  toast(`SKIN DÉBLOQUÉ : ${SKIN[id].name.toUpperCase()}`, player.x, player.y - 62, '#ffd166');
  sfx.oneup();
  return true;
}

/* Passe en revue les skins verrouillés dont la condition vient d'être remplie. */
function checkUnlocks() {
  for (const s of SKINS) if (s.test && !unlocked.has(s.id) && s.test()) unlock(s.id);
}

function pickSkin(id) {
  if (!unlocked.has(id) || skin === id) return false;
  skin = id;
  saveSkins();
  sfx.pickup();
  return true;
}

const canvas = document.getElementById('game');
// Réassignable : les vignettes de la légende rejouent les mêmes fonctions de
// dessin dans leur propre contexte (voir drawInto).
let ctx = canvas.getContext('2d');

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
  crunch: () => beep(rand(190, 250), 0.05, 'square', 0.03),
  tick: () => beep(1200, 0.03, 'square', 0.03),
  transcend: () => [523, 784, 1047, 1319, 1568].forEach((f, i) => setTimeout(() => beep(f, 0.5, 'triangle', 0.05), i * 110)),
  clip: () => beep(1500, 0.05, 'square', 0.045),
  check: () => { beep(523, 0.1, 'triangle', 0.06); setTimeout(() => beep(784, 0.16, 'triangle', 0.06), 90); },
  fart: () => [0, 90, 165].forEach((d, i) => setTimeout(() => beep(rand(58, 104) - i * 6, 0.14, 'sawtooth', 0.055), d)),
  noodle: () => { beep(880, 0.06, 'triangle', 0.05); setTimeout(() => beep(560, 0.1, 'triangle', 0.045), 60); },
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
let player, platforms, razors, bonuses, toasts, particles, backFeet;
let camY, groundY, goalY, best, shake, frames, razorTimer, endTimer;
let lives, checkpoint, restPlaced, downTimer, deathReason;
let catTimer, catFrom, catTarget;
let fries, wheelTimer, wheelPick, wheelStep, cracks, crackT;

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
    jet: 0, fries: 0, noodles: 0, grapple: null, trans: 0,
  };

  lives = START_LIVES;
  checkpoint = { x: VIEW.w / 2 - 90, y: groundY, w: 180, type: 'ground' };
  restPlaced = false;
  downTimer = 0;
  deathReason = null;
  catTimer = 0;
  catFrom = 0;
  catTarget = 0;
  stopCatSound();

  platforms = [{ ...checkpoint, dead: false }];
  razors = [];
  bonuses = [];
  toasts = [];
  particles = [];
  fries = [];
  wheelTimer = 0;
  wheelPick = null;
  wheelStep = -1;
  cracks = [];
  crackT = 0;
  shake = 0;
  frames = 0;
  razorTimer = 140;
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

/* Le sommet de la colonne déjà construite : y décroît en montant. */
function highestPlatform() {
  let top = platforms[0].y;
  for (const plat of platforms) if (plat.y < top) top = plat.y;
  return top;
}

/* Fill the column with platforms up to one screen above the camera. Difficulty
   rides on height: bigger gaps, narrower ledges, more moving/fragile ones. */
function buildPlatforms() {
  // Le curseur, c'est la passerelle la plus haute — pas la dernière ajoutée :
  // la transcendance intercale des passerelles en fin de tableau et repartir de
  // celles-là regénèrerait toute la colonne par-dessus l'existante.
  // If culling ever empties the column (only reachable by teleporting the
  // player), reseed from just below the camera instead of stalling forever.
  let top = platforms.length ? highestPlatform() : camY + VIEW.h;
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
    if (!restPlaced && next <= MID_REST) {
      // The single wide checkpoint ledge, halfway to Sabrina.
      type = 'rest';
      width = 136;
      restPlaced = true;
    } else {
      const roll = Math.random();
      if (climbed > 900 && roll < 0.16 + t * 0.12) type = 'moving';
      else if (climbed > 1800 && roll < 0.32 + t * 0.14) type = 'fragile';
      else if (climbed > 400 && roll < 0.46) type = 'spring';   // trampoline
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
  } else if (roll < 0.018) kind = 'clipper';
  else if (roll < 0.038) kind = 'heart';
  else if (roll < 0.056) kind = 'uber';
  else if (roll < 0.068 && climbed > 600) kind = 'cat';
  else if (roll < 0.074 && climbed > 1200) kind = 'life';
  else if (roll < 0.0775 && climbed > 1000) kind = 'creme';   // très rare

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
    if (plat.press > 0) plat.press--;
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
  let spark = BONUS[b.kind].spark;

  if (b.kind === 'heart') {
    if (player.hp < MAX_HP) {
      player.hp += 1;
      sfx.pickup();
    } else if (lives < MAX_LIVES) {
      // Une canette de trop se transforme en vie.
      lives += 1;
      label = '+1 VIE';
      sfx.oneup();
    } else {
      label = 'DÉJÀ AU MAX';
      sfx.pickup();
    }
  } else if (b.kind === 'life') {
    lives = Math.min(MAX_LIVES, lives + 1);
    if (lives === MAX_LIVES) label = 'VIES AU MAX';
    sfx.oneup();
  } else if (b.kind === 'clipper') {
    player.clipper = CLIPPER_TIME;
    sfx.pickup();
  } else if (b.kind === 'cat') {
    startCat();
  } else if (b.kind === 'creme') {
    startTranscend();
  } else if (b.kind === 'uber') {
    startWheel();
  }

  burst(b.x, b.y, 13, ['#fdf6ef', spark], 3.2);
  toast(label, b.x, b.y - 14, spark);
}

/* ------------------------------------------------------------------- meals

   One Uber Eats code, one random dish, one power. */

function serveMeal(meal) {
  if (meal === 'indien') {
    player.jet = JET_TIME;
    sfx.fart();
  } else if (meal === 'nouilles') {
    player.noodles = NOODLE_USES;
    sfx.noodle();
  } else {
    player.fries = FRIES_TIME;
    sfx.crunch();
  }
  toast(MEAL[meal].label, player.x, player.y - 46, MEAL[meal].spark);
}

/* Les frites : il mange salement et en perd la moitié vers l'avant. Une frite
   qui touche un rasoir le détruit et se détruit avec. */

function ejectFry() {
  fries.push({
    x: player.x + player.face * 9,
    y: player.y - 4,
    vx: player.face * rand(3.6, 5.8) + player.vx * 0.3,
    vy: rand(-2.8, 0.4),
    rot: rand(0, Math.PI * 2),
    spin: rand(-0.3, 0.3),
    age: 0,
  });
  if (fries.length % 2 === 0) sfx.crunch();
}

function stepFries() {
  for (const fry of fries) {
    fry.x += fry.vx;
    fry.y += fry.vy;
    fry.vy += 0.09;
    fry.rot += fry.spin;
    fry.age++;
    if (fry.gone) continue;
    for (const razor of razors) {
      if (razor.gone) continue;
      if (Math.hypot(razor.x - fry.x, razor.y - fry.y) < razor.r + 7) {
        razor.gone = true;
        fry.gone = true;
        burst(fry.x, fry.y, 8, ['#ffd93b', '#fff3c4', '#dbe7f5'], 2.6);
        sfx.clip();
        break;
      }
    }
  }
  fries = fries.filter((f) => !f.gone && f.age < 170
    && f.x > -40 && f.x < VIEW.w + 40 && f.y < camY + VIEW.h + 80);
}

/* --------------------------------------------------------- la machine à sous

   Le code Uber Eats fait tourner une roue qui ralentit et s'arrête sur le plat
   tiré au sort, puis le sert. */

function startWheel() {
  state = 'wheel';
  wheelTimer = 0;
  wheelPick = pick(MEALS);
  wheelStep = -1;
  player.vy = 0;
  player.grapple = null;
}

/* Position continue de la roue, en nombre d'items, qui décélère et tombe
   pile sur l'index tiré. */
function wheelPos() {
  const p = clamp(wheelTimer / WHEEL_SPIN, 0, 1);
  const eased = 1 - Math.pow(1 - p, 3);
  const target = MEALS.indexOf(wheelPick);
  return eased * (MEALS.length * 6 + target);
}

function stepWheel() {
  wheelTimer++;

  const step = Math.floor(wheelPos());
  if (step !== wheelStep) {
    wheelStep = step;
    if (wheelTimer < WHEEL_SPIN) sfx.tick();
  }

  if (wheelTimer === WHEEL_SPIN) {
    sfx.oneup();
    shake = 10;
    burst(VIEW.w / 2, camY + VIEW.h / 2, 18, ['#06c167', '#fdf6ef', '#ffd166'], 4);
  }

  if (wheelTimer >= WHEEL_SPIN + WHEEL_HOLD) {
    state = 'play';
    serveMeal(wheelPick);
  }
}

/* ------------------------------------------------------------ transcendance

   Le crâne devient si luisant qu'il fend le monde : l'écran se fracture, le
   thème bascule, et des passerelles intermédiaires apparaissent. */

function startTranscend() {
  player.trans = TRANS_TIME;
  crackT = 0;
  shake = 22;
  sfx.transcend();
  burst(player.x, player.y - 12, 26, ['#fff6cd', '#ffffff', '#ffe9a0'], 5);

  // Géométrie de la fracture, figée une fois pour toutes pour ne pas frétiller.
  cracks = [];
  const cx = player.x;
  const cy = player.y - camY - 12;
  for (let i = 0; i < 9; i++) {
    const line = [{ x: cx, y: cy }];
    let a = (i / 9) * Math.PI * 2 + rand(-0.2, 0.2);
    let x = cx;
    let y = cy;
    for (let seg = 0; seg < 5; seg++) {
      a += rand(-0.5, 0.5);
      const len = rand(50, 130);
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      line.push({ x, y });
    }
    cracks.push(line);
  }

  ensureGhosts();
  toast('TRANSCENDANCE', player.x, player.y - 54, '#fff6cd');
}

/* Comble chaque trou trop grand par une passerelle intermédiaire. Idempotent :
   une fois posée, les deux moitiés sont sous le seuil. */
function ensureGhosts() {
  const sorted = [...platforms].sort((a, b) => b.y - a.y);
  const added = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const below = sorted[i];
    const above = sorted[i + 1];
    const gap = below.y - above.y;
    if (gap <= GHOST_GAP) continue;
    const w = 86;
    const mid = (below.x + below.w / 2 + above.x + above.w / 2) / 2;
    added.push({
      x: clamp(mid - w / 2 + rand(-26, 26), 6, VIEW.w - w - 6),
      y: below.y - gap / 2,
      w,
      type: 'ghost',
      dead: false,
    });
  }
  platforms.push(...added);
}

/* Le monde se recolle : les passerelles intermédiaires s'évaporent. Appelé aussi
   quand une vie se termine pendant la transcendance, sinon elles resteraient. */
function clearGhosts(sparkle) {
  for (const plat of platforms) {
    if (plat.type === 'ghost') {
      plat.dead = true;
      if (sparkle) burst(plat.x + plat.w / 2, plat.y, 4, ['#fff6cd', '#ffffff'], 2);
    }
  }
  platforms = platforms.filter((p) => !p.dead);
  cracks = [];
  crackT = 0;
}

function endTranscend() {
  clearGhosts(true);
  toast('…retour au monde', player.x, player.y - 40, '#c7b6a8');
}

/* Spider-Alex: tap a platform and a noodle reels him in. Moving platforms are
   tracked by offset, so the anchor follows them. */
function platformNear(wx, wy) {
  let best = null;
  let bestD = NOODLE_RANGE;
  for (const plat of platforms) {
    if (plat.dead) continue;
    const cx = clamp(wx, plat.x, plat.x + plat.w);
    const d = Math.hypot(wx - cx, wy - plat.y);
    if (d < bestD) {
      bestD = d;
      best = plat;
    }
  }
  return best;
}

function startGrapple(plat, wx) {
  player.noodles -= 1;
  const grabOff = clamp(wx, plat.x + 8, plat.x + plat.w - 8) - plat.x;
  player.grapple = {
    plat,
    grabOff,
    t: 0,
    fromX: player.x,
    fromY: player.y,
    toX: plat.x + grabOff,
    toY: plat.y - player.h / 2,
  };
  sfx.noodle();
}

function stepGrapple() {
  const g = player.grapple;
  g.t += 1;

  const live = g.plat && !g.plat.dead;
  const toX = live ? g.plat.x + g.grabOff : g.toX;
  const toY = live ? g.plat.y - player.h / 2 : g.toY;

  const p = clamp(g.t / GRAPPLE_FRAMES, 0, 1);
  const eased = p * p * (3 - 2 * p);
  player.x = g.fromX + (toX - g.fromX) * eased;
  player.y = g.fromY + (toY - g.fromY) * eased;
  player.face = toX < g.fromX ? -1 : 1;
  player.peak = Math.max(player.peak, (groundY - player.h / 2 - player.y) / 10);
  camY = Math.min(camY, player.y - VIEW.h * 0.55);

  if (g.t % 3 === 0) burst(player.x, player.y, 1, ['#ffd166', '#fff0c2'], 1);

  if (p >= 1) {
    player.grapple = null;
    if (live) {
      land(g.plat);
    } else {
      player.vy = JUMP * 0.9;
      sfx.jump();
    }
  }
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
  player.grapple = null;
  razors = [];
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
    razorTimer = Math.max(razorTimer, 100);
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

/* ------------------------------------------------------------------ razors */

function spawnRazor() {
  const climbed = altitude() * 10;
  const t = clamp(climbed / GOAL, 0, 1);
  const fromLeft = Math.random() < 0.5;
  const speed = rand(2.1, 3.4) + t * 1.9;
  razors.push({
    x: fromLeft ? -24 : VIEW.w + 24,
    y: camY + rand(VIEW.h * 0.05, VIEW.h * 0.92),
    vx: fromLeft ? speed : -speed,
    vy: rand(-0.5, 0.7),
    r: rand(9, 13),
    rot: rand(0, Math.PI * 2),
    spin: rand(-0.16, 0.16),
  });
}

function stepRazors() {
  const climbed = altitude() * 10;
  const t = clamp(climbed / GOAL, 0, 1);

  if (climbed > 260 && --razorTimer <= 0) {
    spawnRazor();
    if (t > 0.55 && Math.random() < 0.32) spawnRazor();   // late-game volleys
    razorTimer = Math.round(rand(72, 128) - t * 38);
  }

  for (const razor of razors) {
    razor.x += razor.vx;
    razor.y += razor.vy;
    razor.rot += razor.spin;
    if (razor.gone) continue;
    if (player.clipper > 0 && overlapsPlayer(razor.x, razor.y, razor.r + 14)) clip(razor);
    else if (player.invuln === 0 && hitsPlayer(razor)) hurt(razor);
  }

  razors = razors.filter((n) => n.x > -60 && n.x < VIEW.w + 60 && n.y < camY + VIEW.h + 120 && !n.gone);
}

/* Circle against Alexandre's body box — used for both razors and pickups. */
function overlapsPlayer(x, y, r) {
  const nx = clamp(x, player.x - player.w / 2, player.x + player.w / 2);
  const ny = clamp(y, player.y - player.h / 2, player.y + player.h / 2);
  return Math.hypot(x - nx, y - ny) < r;
}

function hitsPlayer(razor) {
  return overlapsPlayer(razor.x, razor.y, razor.r * 0.8);
}

/* Clipped, not hurt: the razor clipper turns razors into confetti. */
function clip(razor) {
  razor.gone = true;
  burst(razor.x, razor.y, 9, ['#8bd7ff', '#fdf6ef', '#dbe7f5'], 2.6);
  sfx.clip();
}

function hurt(razor) {
  if (state !== 'play') return;
  razor.gone = true;
  player.hp -= 1;
  player.invuln = INVULN;
  shake = 14;
  burst(razor.x, razor.y, 14, ['#dbe7f5', '#8fc4f5', '#ffffff']);
  if (player.hp <= 0) downed('rasoirs');
  else sfx.hurt();
}

/* One life gone. If any remain he drops back to his last checkpoint. */
function downed(reason) {
  if (state !== 'play') return;
  lives -= 1;
  deathReason = reason;
  player.hp = 0;
  player.clipper = 0;
  player.jet = 0;
  player.fries = 0;
  player.noodles = 0;
  player.trans = 0;
  clearGhosts(false);
  player.grapple = null;
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
  razors = [];
  bonuses = [];

  player.x = checkpoint.x + checkpoint.w / 2;
  player.y = checkpoint.y - player.h / 2 - 2;
  player.vx = 0;
  player.vy = 0;
  player.hp = MAX_HP;
  player.invuln = INVULN;
  razorTimer = 130;
  restPlaced = checkpoint.type === 'rest';   // the mid ledge is behind him now

  camY = checkpoint.y - VIEW.h * 0.55;
  buildPlatforms();
  toast('ON REPART !', player.x, player.y - 46, '#8bffc8');
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
  if (player.grapple) {
    stepGrapple();
    return;
  }

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

  // La propulsion au curry bat la gravité.
  if (player.jet > 0) player.vy = Math.max(player.vy - 1.15, JET_MAX);

  player.y += player.vy;

  // Le pet ne le porte jamais au-dessus du trône : arrivé là, la propulsion se
  // coupe et il redescend se poser comme tout le monde.
  const jetCeiling = goalY - player.h / 2 - 8;
  if (player.jet > 0 && player.y < jetCeiling) {
    player.y = jetCeiling;
    player.vy = 0;
    player.jet = 0;
    toast('PLUS HAUT, C’EST SABRINA', player.x, player.y - 46, '#9ab53a');
  }

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
  if (player.fries > 0) {
    player.fries--;
    if (player.fries % FRY_EVERY === 0) ejectFry();
  }
  if (player.trans > 0) {
    crackT++;
    if (--player.trans === 0) endTranscend();
    else if (player.trans % 6 === 0) ensureGhosts();
  }
  if (player.jet > 0) {
    player.jet--;
    if (player.jet % 2 === 0) {
      burst(player.x + rand(-5, 5), player.y + player.h / 2 - 2, 2,
        ['#9ab53a', '#7a8f2c', 'rgba(190,210,130,.7)'], 2.2);
    }
    if (player.jet % 15 === 0) beep(rand(56, 96), 0.1, 'sawtooth', 0.035);
  }
  if (player.squash > 0) player.squash--;
  if (player.vy < -15 && frames % 2 === 0) {
    burst(player.x, player.y + player.h / 2, 2, ['#ffd166', '#5b8def', 'rgba(255,255,255,.9)'], 1.2);
  }
  if (--player.blink < 0) player.blink = Math.round(rand(90, 240));

  player.peak = Math.max(player.peak, (groundY - player.h / 2 - player.y) / 10);
  checkUnlocks();

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
  if (plat.type === 'spring') {
    player.vy = SPRING_VY;
    plat.press = 12;
    burst(player.x, plat.y, 9, ['#ffd166', '#fff0c2', '#ffb27a'], 3);
    sfx.boost();
  }
  if (plat.type === 'rest' && plat.y < checkpoint.y) {
    checkpoint = { x: plat.x, y: plat.y, w: plat.w, type: 'rest' };
    toast('CHECKPOINT !', player.x, plat.y - 34, '#8bffc8');
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
  checkUnlocks();   // l'ascension sans perdre de vie ne se juge qu'ici
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
  const t = clamp((groundY - camY) / GOAL, 0, 1);       // le ciel s'éclaircit en montant
  const trans = player.trans > 0;

  if (trans) {
    const fade = player.trans < 60 ? player.trans / 60 : 1;
    grad.addColorStop(0, `hsl(48, ${60 * fade}%, ${86 - (1 - fade) * 60}%)`);
    grad.addColorStop(1, `hsl(268, ${45 * fade}%, ${62 - (1 - fade) * 40}%)`);
  } else {
    grad.addColorStop(0, `hsl(${272 - t * 30}, 45%, ${9 + t * 16}%)`);
    grad.addColorStop(1, `hsl(${318 - t * 26}, 38%, ${16 + t * 20}%)`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  // Parallax feet, drifting and wrapping over a two-screen band.
  const band = VIEW.h * 2;
  for (const foot of backFeet) {
    foot.rot += foot.spin;
    let sy = foot.y - camY * 0.3;
    sy = ((sy % band) + band) % band - VIEW.h * 0.5;
    ctx.save();
    ctx.globalAlpha = player.trans > 0 ? Math.min(0.5, foot.alpha * 2.4) : foot.alpha;
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
  if (plat.type === 'spring') { top = '#ffe066'; side = '#b8871a'; }
  if (plat.type === 'throne') { top = '#ffd166'; side = '#c98f22'; }
  if (plat.cracking) { top = '#ff8f6b'; side = '#8c3d20'; }

  // Les passerelles intermédiaires de la transcendance : lumineuses, translucides.
  if (plat.type === 'ghost') {
    const pulse = 0.4 + Math.sin(frames * 0.08 + plat.x) * 0.12;
    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    roundRect(plat.x, y, plat.w, h - 5, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,190,.75)';
    ctx.lineWidth = 1.4;
    roundRect(plat.x, y, plat.w, h - 5, 5);
    ctx.stroke();
    return;
  }

  // Sous transcendance, tout le décor blanchit.
  if (player.trans > 0) {
    top = '#fff6d8';
    side = 'rgba(216,201,160,.85)';
    if (plat.type === 'spring') { top = '#ffe8a0'; side = 'rgba(200,170,90,.9)'; }
    if (plat.type === 'rest') { top = '#e6fff2'; side = 'rgba(150,210,180,.9)'; }
  }

  const squash = plat.press > 0 ? plat.press / 12 : 0;
  const dy = squash * 4;

  ctx.fillStyle = side;
  roundRect(plat.x, y + dy, plat.w, h - dy, 6);
  ctx.fill();
  ctx.fillStyle = top;
  roundRect(plat.x, y + dy, plat.w, h - 4 - dy, 6);
  ctx.fill();

  if (plat.type === 'spring') {
    // ressort en zigzag, comprimé au rebond
    ctx.strokeStyle = 'rgba(120,80,10,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const zig = 5;
    for (let i = 0; i <= zig; i++) {
      const x = plat.x + 8 + (i * (plat.w - 16)) / zig;
      const yy = y + dy + (i % 2 === 0 ? 2 : h - 6 - dy);
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    if (squash > 0) {
      ctx.strokeStyle = `rgba(255,224,102,${squash * 0.7})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(plat.x + plat.w / 2, y, 20 + (1 - squash) * 30, Math.PI, 0);
      ctx.stroke();
    }
  }

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

/* Un rasoir jetable qui tourne : manche bleu strié, col chromé, tête à lames. */
function drawRazor(razor) {
  const y = razor.y - camY;
  if (y < -46 || y > VIEW.h + 46) return;
  const len = razor.r * 2.7;
  const w = razor.r * 0.95;

  ctx.save();
  ctx.translate(razor.x, y);
  ctx.rotate(razor.rot);

  // manche
  const grip = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  grip.addColorStop(0, '#245a96');
  grip.addColorStop(0.42, '#8fc4f5');
  grip.addColorStop(1, '#1f4d80');
  ctx.fillStyle = grip;
  roundRect(-w / 2, -len / 2, w, len * 0.6, w * 0.42);
  ctx.fill();

  // stries antidérapantes
  ctx.strokeStyle = 'rgba(12,32,56,.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i <= 4; i++) {
    const gy = -len / 2 + (len * 0.6 * i) / 5.5;
    ctx.moveTo(-w * 0.34, gy);
    ctx.lineTo(w * 0.34, gy);
  }
  ctx.stroke();

  // col
  const steel = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  steel.addColorStop(0, '#8b98a8');
  steel.addColorStop(0.4, '#ffffff');
  steel.addColorStop(1, '#7e8b9c');
  ctx.fillStyle = steel;
  roundRect(-w * 0.24, len * 0.08, w * 0.48, len * 0.14, 1.5);
  ctx.fill();

  // tête et lames
  ctx.fillStyle = steel;
  roundRect(-w * 0.92, len * 0.19, w * 1.84, len * 0.24, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    const by = len * (0.25 + i * 0.08);
    ctx.moveTo(-w * 0.8, by);
    ctx.lineTo(w * 0.8, by);
  }
  ctx.stroke();
  ctx.fillStyle = '#8be9fd';
  roundRect(-w * 0.9, len * 0.4, w * 1.8, len * 0.05, 1);
  ctx.fill();

  // éclat sur le manche
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  roundRect(-w * 0.22, -len * 0.44, w * 0.16, len * 0.42, w * 0.08);
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
  drawBonusIcon(b.kind, b.bob);
  ctx.restore();
}

/* Le dessin d'un bonus, centré sur l'origine courante. La légende s'en sert
   telle quelle pour montrer les vraies icônes du jeu. */
function drawBonusIcon(kind, bob) {
  const b = { kind, bob };

  ctx.save();
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
  glow.addColorStop(0, BONUS[b.kind].glow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.fill();

  if (b.kind === 'heart') {
    ctx.rotate(Math.sin(b.bob * 0.6) * 0.16);
    drawCan(false);
  } else if (b.kind === 'life') {
    drawFaceIcon(0, 0, 9);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 13, b.bob, b.bob + Math.PI * 1.5);
    ctx.stroke();
  } else if (b.kind === 'clipper') {
    // razor clipper: chromed body, lever across the top, jaw at the bottom
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
  } else if (b.kind === 'creme') {
    // pot de crème pour le crâne, couvercle doré et éclat
    ctx.rotate(Math.sin(b.bob * 0.4) * 0.1);
    ctx.fillStyle = '#f4ecff';
    roundRect(-8, -5, 16, 14, 3);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    roundRect(-9, -9, 18, 5, 2);
    ctx.fill();
    ctx.fillStyle = '#e6d6ff';
    roundRect(-5.5, -1, 11, 5, 1.5);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.5 + Math.sin(b.bob * 2) * 0.3})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const a of [0, 1, 2, 3]) {
      const ang = (a / 4) * Math.PI * 2 + b.bob * 0.5;
      ctx.moveTo(Math.cos(ang) * 12, Math.sin(ang) * 12 - 2);
      ctx.lineTo(Math.cos(ang) * 17, Math.sin(ang) * 17 - 2);
    }
    ctx.stroke();
  } else if (b.kind === 'cat') {
    drawCat(0, 6, 0.62, false, false);
  } else if (b.kind === 'uber') {
    // paper delivery bag with a green label
    ctx.rotate(Math.sin(b.bob * 0.5) * 0.12);
    ctx.strokeStyle = '#c9a06a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-3, -8, 3.2, Math.PI, 0);
    ctx.arc(3.5, -8, 3.2, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#d8a86e';
    roundRect(-8, -7, 16, 18, 2);
    ctx.fill();
    ctx.fillStyle = '#c1905a';
    roundRect(-8, -7, 16, 3.5, 1.5);
    ctx.fill();
    ctx.fillStyle = '#06c167';
    roundRect(-5.5, -1, 11, 7, 1.5);
    ctx.fill();
    ctx.fillStyle = '#04381f';
    roundRect(-3.5, 1.4, 7, 1.4, 0.7);
    ctx.fill();
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

/* The noodle he's currently reeling himself in on. */
function drawNoodle() {
  const g = player.grapple;
  if (!g) return;
  const live = g.plat && !g.plat.dead;
  const ax = live ? g.plat.x + g.grabOff : g.toX;
  const ay = (live ? g.plat.y : g.toY) - camY;
  const px = player.x;
  const py = player.y - camY - 8;

  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px, py);
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const wob = Math.sin(t * 7 + frames * 0.45) * 6 * (1 - t);
    ctx.lineTo(px + (ax - px) * t + wob, py + (ay - py) * t);
  }
  ctx.stroke();
  ctx.fillStyle = '#fff0c2';
  ctx.beginPath();
  ctx.arc(ax, ay, 3.4, 0, Math.PI * 2);
  ctx.fill();
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
    // Les libellés longs sont recentrés pour ne pas déborder de l'écran.
    const half = ctx.measureText(t.text).width / 2 + 8;
    const x = clamp(t.x, Math.min(half, VIEW.w / 2), Math.max(VIEW.w - half, VIEW.w / 2));
    ctx.strokeText(t.text, x, t.y - camY);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, x, t.y - camY);
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

  // curry propulsion: a plume at his feet, since the particle trail is left far
  // behind once he's climbing at full thrust
  if (player.jet > 0) {
    for (let i = 0; i < 3; i++) {
      const t = frames * 0.35 + i * 2.1;
      ctx.fillStyle = `rgba(154,181,58,${0.45 - i * 0.12})`;
      ctx.beginPath();
      ctx.arc(Math.sin(t * 1.3) * 3.5, 23 + i * 10, 7 + Math.sin(t) * 2.4 + i * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawAlexandre(skin, {
    rising: player.vy < 0,
    blink: player.blink < 6,
    fries: player.fries > 0,
    trans: player.trans > 0,
  });

  ctx.restore();
  ctx.globalAlpha = 1;
}

/* Alexandre lui-même, dessiné à l'origine courante. `pose` le découple de
   l'état de la partie : le sélecteur de skins et la légende montrent ainsi le
   vrai personnage sans avoir à simuler un saut. */
function drawAlexandre(skinId, pose = {}) {
  const s = SKIN[skinId] || SKIN[FREE_SKIN];
  const { rising = false, blink = false, fries = false, trans = false } = pose;
  const kick = rising ? 4 : 9;

  if (s.wings) drawWings(rising);

  // shadow-ish outline behind the body keeps him readable on bright platforms
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  roundRect(-12, -4, 24, 24, 8);
  ctx.fill();

  // legs — plus épaisses quand c'est un pantalon, pour qu'on en voie la couleur
  ctx.strokeStyle = s.trousers;
  ctx.lineWidth = s.bare ? 4 : 4.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-5, 14);
  ctx.lineTo(-7, 14 + kick);
  ctx.moveTo(5, 14);
  ctx.lineTo(8, 14 + kick - 2);
  ctx.stroke();
  ctx.strokeStyle = s.shoes;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-9, 14 + kick);
  ctx.lineTo(-5, 14 + kick);
  ctx.moveTo(6, 12 + kick);
  ctx.lineTo(10, 12 + kick);
  ctx.stroke();

  // torse : habillé, ou nu avec la tenue posée par-dessus
  if (s.bare) {
    ctx.fillStyle = '#f0c49b';
    roundRect(-10, -3, 20, 20, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(224,174,134,.55)';   // un nombril, un soupçon de ventre
    roundRect(-8, 6, 16, 9, 5);
    ctx.fill();
    ctx.fillStyle = '#d79b73';
    ctx.beginPath();
    ctx.arc(0, 8, 1.1, 0, Math.PI * 2);
    ctx.fill();
    drawUnderwear(s);
  } else {
    // le t-shirt s'arrête au-dessus de la taille : sans ça le pantalon ne se
    // voit pas entre le torse et les chaussures
    ctx.fillStyle = s.shirt;
    roundRect(-10, -3, 20, 17, 7);
    ctx.fill();
    ctx.fillStyle = s.collar;
    roundRect(-10, -3, 20, 8, 6);
    ctx.fill();
  }

  // arms — up when rising, out when falling
  ctx.strokeStyle = '#f0c49b';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  if (rising) {
    ctx.moveTo(-9, 2); ctx.lineTo(-14, -7);
    ctx.moveTo(9, 2); ctx.lineTo(14, -7);
  } else {
    ctx.moveTo(-9, 2); ctx.lineTo(-15, 6);
    ctx.moveTo(9, 2); ctx.lineTo(15, 6);
  }
  ctx.stroke();

  // manches courtes, posées par-dessus l'épaule pour que le t-shirt se lise
  if (s.sleeves) {
    ctx.fillStyle = s.shirt;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(dir * 9.6, 0.8, 3.6, 4.4, dir * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

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

  if (s.crown) drawTinyCrown();

  // cornet de frites, tenu bien serré
  if (fries) {
    ctx.fillStyle = '#c62828';
    ctx.beginPath();
    ctx.moveTo(11, -4); ctx.lineTo(21, -4); ctx.lineTo(19, 8); ctx.lineTo(13, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffe680';
    for (const dx of [12.5, 15.5, 18.5]) {
      ctx.save();
      ctx.translate(dx, -8);
      roundRect(-1.3, -4, 2.6, 8, 1.2);
      ctx.fill();
      ctx.restore();
    }
  }

  if (trans) {
    // Le crâne transcende : pas de lunettes, des yeux blancs et brillants — mais
    // la lumière reste dans l'œil, rien n'en sort.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-4.4, -12, 3.2, 3.8, 0, 0, Math.PI * 2);
    ctx.ellipse(4.4, -12, 3.2, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // l'éclat qui glisse dans l'œil, plus le petit point spéculaire
    const sheen = 0.55 + Math.sin(frames * 0.12) * 0.25;
    ctx.fillStyle = `rgba(255,252,235,${sheen})`;
    ctx.beginPath();
    ctx.ellipse(-4.4, -13.4, 2.2, 1.5, -0.4, 0, Math.PI * 2);
    ctx.ellipse(4.4, -13.4, 2.2, 1.5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath();
    ctx.arc(-5.5, -13.6, 0.9, 0, Math.PI * 2);
    ctx.arc(3.3, -13.6, 0.9, 0, Math.PI * 2);
    ctx.fill();

    // un liseré nacré pour détacher l'œil du crâne, sans déborder
    ctx.strokeStyle = 'rgba(226,208,150,.85)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(-4.4, -12, 3.2, 3.8, 0, 0, Math.PI * 2);
    ctx.ellipse(4.4, -12, 3.2, 3.8, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // lunettes
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

    // yeux
    ctx.fillStyle = '#241c33';
    const eyeH = blink ? 0.6 : 1.7;
    ctx.beginPath();
    ctx.ellipse(-4.4, -12, 1.5, eyeH, 0, 0, Math.PI * 2);
    ctx.ellipse(4.4, -12, 1.5, eyeH, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // petit sourire d'espoir
  ctx.strokeStyle = '#8a5a45';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, -6.5, 3.2, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.stroke();
}

/* Le caleçon, ou le slip de bain : la même ceinture, mais une jambe courte pour
   l'un et une échancrure haute pour l'autre. */
function drawUnderwear(s) {
  ctx.fillStyle = s.shorts;
  ctx.beginPath();
  if (s.briefs) {
    // slip : taille haute et hanches échancrées jusqu'en haut de la cuisse
    ctx.moveTo(-9.4, 4.5);
    ctx.lineTo(9.4, 4.5);
    ctx.lineTo(9, 11);
    ctx.quadraticCurveTo(8.2, 15.4, 4.6, 15.4);
    ctx.quadraticCurveTo(1.6, 14.8, 0, 13);
    ctx.quadraticCurveTo(-1.6, 14.8, -4.6, 15.4);
    ctx.quadraticCurveTo(-8.2, 15.4, -9, 11);
  } else {
    // caleçon : deux jambes courtes séparées par une fourche
    ctx.moveTo(-9.2, 4.5);
    ctx.lineTo(9.2, 4.5);
    ctx.lineTo(9.2, 13.4);
    ctx.quadraticCurveTo(9.2, 15.6, 7, 15.6);
    ctx.lineTo(2.4, 15.6);
    ctx.quadraticCurveTo(1.2, 15.6, 0.8, 14);
    ctx.lineTo(0, 11.4);
    ctx.lineTo(-0.8, 14);
    ctx.quadraticCurveTo(-1.2, 15.6, -2.4, 15.6);
    ctx.lineTo(-7, 15.6);
    ctx.quadraticCurveTo(-9.2, 15.6, -9.2, 13.4);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = s.shortsBand;                 // la ceinture élastique
  roundRect(-9.6, 3.6, 19.2, 3.4, 1.7);
  ctx.fill();

  if (s.shortsDots) {                           // caleçon à pois
    ctx.fillStyle = s.shortsDots;
    for (const [dx, dy] of [[-5.6, 9.6], [5.6, 9.6], [-3.4, 12.8], [3.4, 12.8]]) {
      ctx.beginPath();
      ctx.arc(dx, dy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (s.logo) drawMistralLogo(0, 10.4, 1.25);
}

/* Le M de Mistral : cinq colonnes de cases, une couleur par ligne, du jaune en
   haut au rouge en bas. `s` est la taille d'une case. */
function drawMistralLogo(x, y, s) {
  const cols = MISTRAL_M.length;
  const rows = MISTRAL_BANDS.length;
  ctx.save();
  ctx.translate(x - (cols * s) / 2, y - (rows * s) / 2);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (!MISTRAL_M[c][r]) continue;
      ctx.fillStyle = MISTRAL_BANDS[r];
      ctx.fillRect(c * s, r * s, s + 0.06, s + 0.06);   // chevauchement anti-liseré
    }
  }
  ctx.restore();
}

/* Les ailes de papillon, derrière lui : elles battent quand il monte. */
function drawWings(rising) {
  const beat = Math.sin(frames * (rising ? 0.34 : 0.14));
  ctx.save();
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.rotate(dir * (0.22 + beat * 0.12));
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = '#ffa8d4';
    ctx.beginPath();                                     // aile haute
    ctx.ellipse(dir * 14, -6, 11, 8, dir * -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff86bf';
    ctx.beginPath();                                     // aile basse
    ctx.ellipse(dir * 11, 5, 7.5, 6, dir * -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff0f7';                           // ocelles
    ctx.beginPath();
    ctx.arc(dir * 16, -7, 2.6, 0, Math.PI * 2);
    ctx.arc(dir * 12, 5, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* La couronne de princesse, posée sur le crâne luisant. */
function drawTinyCrown() {
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(-7.5, -20.5);
  ctx.lineTo(-6, -27); ctx.lineTo(-2.6, -22.5);
  ctx.lineTo(0, -29); ctx.lineTo(2.6, -22.5);
  ctx.lineTo(6, -27); ctx.lineTo(7.5, -20.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e0a92f';
  roundRect(-7.8, -21.4, 15.6, 2.4, 1.2);
  ctx.fill();
  ctx.fillStyle = '#ff6f91';
  ctx.beginPath();
  ctx.arc(0, -24.2, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

/* Sabrina, the Foot Princess: a regal foot, crowned, waiting at the summit. */
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
  // Sous transcendance le ciel devient crème : l'encre du HUD passe au sombre.
  const ink = player.trans > 0 ? '#3f2d10' : '#fdf6ef';
  const inkDim = player.trans > 0 ? 'rgba(63,45,16,.72)' : 'rgba(253,246,239,.6)';

  // les points de vie sont des canettes
  for (let i = 0; i < MAX_HP; i++) {
    ctx.save();
    ctx.translate(21 + i * 24, 24);
    ctx.scale(0.72, 0.72);
    drawCan(i >= player.hp);
    ctx.restore();
  }

  // les vies, en Alexandres de rechange
  drawFaceIcon(104, 20, 8);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  ctx.font = 'bold 14px ui-rounded, system-ui, sans-serif';
  ctx.fillText(`×${Math.max(0, lives)}`, 116, 21);


  // une jauge par pouvoir en cours, puis les nouilles restantes
  const bars = [];
  if (player.clipper > 0) bars.push(['#8bd7ff', player.clipper / CLIPPER_TIME]);
  if (player.jet > 0) bars.push(['#9ab53a', player.jet / JET_TIME]);
  if (player.fries > 0) bars.push(['#ffd93b', player.fries / FRIES_TIME]);
  if (player.trans > 0) bars.push(['#fff6cd', player.trans / TRANS_TIME]);
  bars.forEach(([color, frac], i) => {
    const by = 40 + i * 10;
    ctx.fillStyle = player.trans > 0 ? 'rgba(63,45,16,.2)' : 'rgba(255,255,255,.16)';
    roundRect(14, by, 76, 6, 3);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(14, by, 76 * clamp(frac, 0, 1), 6, 3);
    ctx.fill();
  });
  if (player.noodles > 0) {
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 12px ui-rounded, system-ui, sans-serif';
    ctx.fillText(`🍜 ×${player.noodles} — clique une passerelle`, 14, 46 + bars.length * 10);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  ctx.font = 'bold 20px ui-rounded, system-ui, sans-serif';
  ctx.fillText(`${climbed} m`, VIEW.w - 16, 26);
  ctx.fillStyle = inkDim;
  ctx.font = '12px ui-rounded, system-ui, sans-serif';
  ctx.fillText(`objectif ${total} m · record ${best} m`, VIEW.w - 16, 43);

  // climb meter down the right edge
  const trackTop = 62;
  const trackH = VIEW.h - 100;
  ctx.fillStyle = player.trans > 0 ? 'rgba(63,45,16,.18)' : 'rgba(255,255,255,.12)';
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
    ctx.fillStyle = inkDim;
    ctx.font = '11px ui-rounded, system-ui, sans-serif';
    ctx.fillText('muet', VIEW.w - 16, VIEW.h - 14);
  }
}

/* Une canette Red Bull, centrée sur l'origine courante. `dim` la vide de ses
   couleurs : c'est un point de vie déjà perdu. */
function drawCan(dim) {
  const body = ctx.createLinearGradient(-7, 0, 7, 0);
  if (dim) {
    body.addColorStop(0, 'rgba(120,126,140,.35)');
    body.addColorStop(0.4, 'rgba(190,196,210,.4)');
    body.addColorStop(1, 'rgba(120,126,140,.35)');
  } else {
    body.addColorStop(0, '#8e97a8');
    body.addColorStop(0.4, '#f2f5fa');
    body.addColorStop(1, '#98a2b3');
  }
  ctx.fillStyle = body;
  roundRect(-6.5, -11, 13, 22, 3);
  ctx.fill();

  ctx.save();
  roundRect(-6.5, -11, 13, 22, 3);
  ctx.clip();
  ctx.fillStyle = dim ? 'rgba(32,65,143,.3)' : '#20418f';
  ctx.beginPath();
  ctx.moveTo(-8, 3); ctx.lineTo(2, -13); ctx.lineTo(8, -13); ctx.lineTo(-8, 11);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, 15); ctx.lineTo(7, -2); ctx.lineTo(9, 5); ctx.lineTo(-2, 15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dim ? 'rgba(255,209,102,.3)' : '#ffd166';
  ctx.beginPath();
  ctx.arc(0, 0, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dim ? 'rgba(198,40,40,.3)' : '#c62828';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * 0.8, -2.6); ctx.lineTo(dir * 5.4, -0.5); ctx.lineTo(dir * 0.8, 2.3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = dim ? 'rgba(207,214,226,.4)' : '#cfd6e2';
  roundRect(-5, -12.5, 10, 3, 1.5);
  ctx.fill();
  if (dim) {
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 1.2;
    roundRect(-6.5, -11, 13, 22, 3);
    ctx.stroke();
  }
}

/* Une frite qui vole. */
function drawFry(fry) {
  const y = fry.y - camY;
  if (y < -30 || y > VIEW.h + 30) return;
  ctx.save();
  ctx.translate(fry.x, y);
  ctx.rotate(fry.rot);
  const g = ctx.createLinearGradient(-2, -7, 2, 7);
  g.addColorStop(0, '#ffe680');
  g.addColorStop(1, '#e8a93b');
  ctx.fillStyle = g;
  roundRect(-2.4, -7.5, 4.8, 15, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  roundRect(-1.2, -6, 1.4, 9, 0.7);
  ctx.fill();
  ctx.restore();
}

/* Les icônes de la roue Uber Eats. */
function drawMealIcon(meal, s) {
  ctx.save();
  ctx.scale(s, s);
  if (meal === 'indien') {
    ctx.fillStyle = '#c9772f';                       // curry
    ctx.beginPath();
    ctx.ellipse(0, -1, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0e6d2';                       // bol
    ctx.beginPath();
    ctx.moveTo(-13, -2);
    ctx.quadraticCurveTo(0, 15, 13, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8a5a2b';
    ctx.beginPath();
    ctx.arc(-4, -2, 1.8, 0, Math.PI * 2);
    ctx.arc(3, -3, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (meal === 'nouilles') {
    ctx.fillStyle = '#f0e6d2';
    ctx.beginPath();
    ctx.moveTo(-13, -2);
    ctx.quadraticCurveTo(0, 15, 13, -2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      ctx.moveTo(i * 4, -2);
      ctx.quadraticCurveTo(i * 4 + 3, -9, i * 4 - 1, -13);
    }
    ctx.stroke();
  } else {
    ctx.fillStyle = '#c62828';                       // cornet de frites
    ctx.beginPath();
    ctx.moveTo(-8, -2); ctx.lineTo(8, -2); ctx.lineTo(5, 14); ctx.lineTo(-5, 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffe680';
    for (const dx of [-5, -1.5, 2, 5.5]) {
      ctx.save();
      ctx.translate(dx, -8);
      ctx.rotate(dx * 0.05);
      roundRect(-1.9, -6, 3.8, 12, 1.6);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/* La machine à sous : la roue défile, ralentit, s'arrête sur le plat tiré. */
function drawWheel() {
  ctx.fillStyle = 'rgba(6,12,8,.62)';
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  const cx = VIEW.w / 2;
  const cy = VIEW.h / 2;
  const slot = 72;
  const done = wheelTimer >= WHEEL_SPIN;

  // caisse de la machine
  ctx.fillStyle = '#0d1c14';
  roundRect(cx - 96, cy - 116, 192, 214, 18);
  ctx.fill();
  ctx.strokeStyle = '#06c167';
  ctx.lineWidth = 3;
  roundRect(cx - 96, cy - 116, 192, 214, 18);
  ctx.stroke();

  // ampoules du fronton
  for (let i = 0; i < 7; i++) {
    const on = done ? Math.floor(frames / 5) % 2 === 0 : (i + Math.floor(frames / 4)) % 3 === 0;
    ctx.fillStyle = on ? '#ffd166' : 'rgba(255,209,102,.22)';
    ctx.beginPath();
    ctx.arc(cx - 78 + i * 26, cy - 100, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 15px ui-rounded, system-ui, sans-serif';
  ctx.fillStyle = '#06c167';
  ctx.fillText('UBER EATS', cx, cy - 80);

  // hublot
  ctx.save();
  roundRect(cx - 62, cy - 62, 124, 104, 10);
  ctx.fillStyle = '#f7f4ee';
  ctx.fill();
  roundRect(cx - 62, cy - 62, 124, 104, 10);
  ctx.clip();

  const pos = wheelPos();
  const frac = pos - Math.floor(pos);
  for (let i = -1; i <= 1; i++) {
    const idx = ((Math.floor(pos) + i) % MEALS.length + MEALS.length) % MEALS.length;
    const y = cy - 10 + i * slot - frac * slot;
    ctx.save();
    ctx.translate(cx, y);
    drawMealIcon(MEALS[idx], 2.1);
    ctx.restore();
  }
  ctx.restore();

  // liseré du hublot + ligne de gain
  ctx.strokeStyle = done ? '#ffd166' : 'rgba(255,255,255,.35)';
  ctx.lineWidth = done ? 3 : 2;
  roundRect(cx - 62, cy - 62, 124, 104, 10);
  ctx.stroke();

  // levier
  ctx.strokeStyle = '#9fb3cc';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx + 104, cy - 40);
  ctx.lineTo(cx + 104, cy - 6 + (done ? 26 : 0));
  ctx.stroke();
  ctx.fillStyle = '#c62828';
  ctx.beginPath();
  ctx.arc(cx + 104, cy - 46, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = 'bold 14px ui-rounded, system-ui, sans-serif';
  if (done) {
    ctx.fillStyle = MEAL[wheelPick].spark;
    ctx.fillText(MEAL[wheelPick].label, cx, cy + 72);
  } else {
    ctx.fillStyle = 'rgba(253,246,239,.75)';
    ctx.fillText('ça tourne…', cx, cy + 72);
  }
}

/* La fracture du monde, figée au moment de la crème puis résorbée à la fin. */
function drawCracks() {
  if (!cracks.length) return;
  const grow = clamp(crackT / CRACK_GROW, 0, 1);
  const fade = player.trans < 60 ? player.trans / 60 : 1;
  ctx.lineCap = 'round';
  for (const line of cracks) {
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * fade})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(line[0].x, line[0].y);
    const upto = 1 + (line.length - 1) * grow;
    for (let i = 1; i < upto; i++) {
      const t = clamp(upto - i, 0, 1);
      const a = line[i - 1];
      const b = line[i];
      ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,230,150,${0.28 * fade})`;
    ctx.lineWidth = 6;
    ctx.stroke();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = 1 - p.age / p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - camY - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

/* Le bouton de fin de partie. Il ne répond qu'après un court délai : sinon le
   clic parti trop vite relance la partie avant qu'on ait pu lire son score. */
const BTN = { w: 216, h: 52 };
const BTN_ARM = 48;              // frames avant que le bouton s'arme

let replayBtn = null;            // rect cliquable, en coordonnées VIEW

function drawPanelButton(label, cy) {
  const armed = endTimer >= BTN_ARM;
  const x = VIEW.w / 2 - BTN.w / 2;
  const y = cy - BTN.h / 2;
  replayBtn = armed ? { x, y, w: BTN.w, h: BTN.h } : null;

  const pulse = 0.34 + Math.sin(frames * 0.07) * 0.1;
  ctx.fillStyle = armed ? `rgba(255,178,122,${pulse})` : 'rgba(255,178,122,.1)';
  roundRect(x, y, BTN.w, BTN.h, 26);
  ctx.fill();
  ctx.strokeStyle = armed ? '#ffb27a' : 'rgba(255,178,122,.3)';
  ctx.lineWidth = 2;
  roundRect(x, y, BTN.w, BTN.h, 26);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 19px ui-rounded, system-ui, sans-serif';
  ctx.fillStyle = armed ? '#fff6ec' : 'rgba(253,246,239,.4)';
  ctx.fillText(label, VIEW.w / 2, y + BTN.h / 2 + 1);

  ctx.font = '12px ui-rounded, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(253,246,239,.55)';
  ctx.fillText(armed ? 'ou appuie sur R' : 'regarde ton score…', VIEW.w / 2, y + BTN.h + 17);
}

/* ------------------------------------------------- le sélecteur de skins

   Trois cartes sur l'écran titre, chacune montrant le vrai personnage dans sa
   tenue. Les verrouillées affichent ce qu'il reste à faire pour les ouvrir. */

const CARD = { w: 100, h: 126, gap: 13 };

let skinCards = [];      // rects cliquables, en coordonnées VIEW

/* Écrit un texte court sur au plus deux lignes, centré. */
function drawWrapped(text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  const lines = [''];
  for (const word of words) {
    const attempt = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
    if (ctx.measureText(attempt).width <= maxW || !lines[lines.length - 1]) {
      lines[lines.length - 1] = attempt;
    } else if (lines.length < 2) {
      lines.push(word);
    } else {
      lines[1] += '…';
      break;
    }
  }
  lines.forEach((line, i) => ctx.fillText(line, cx, y + i * lineH));
}

function drawSkinPicker(cy) {
  skinCards = [];
  const span = SKINS.length * CARD.w + (SKINS.length - 1) * CARD.gap;
  const top = cy - CARD.h / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '11px ui-rounded, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(253,246,239,.5)';
  ctx.fillText('LA TENUE — clique une carte, ou 1 / 2 / 3', VIEW.w / 2, top - 15);

  SKINS.forEach((s, i) => {
    const x = VIEW.w / 2 - span / 2 + i * (CARD.w + CARD.gap);
    const open = unlocked.has(s.id);
    const worn = skin === s.id;
    skinCards.push({ id: s.id, x, y: top, w: CARD.w, h: CARD.h, open });

    ctx.fillStyle = worn ? 'rgba(255,178,122,.2)' : 'rgba(255,255,255,.05)';
    roundRect(x, top, CARD.w, CARD.h, 14);
    ctx.fill();
    ctx.strokeStyle = worn ? '#ffb27a' : 'rgba(255,255,255,.15)';
    ctx.lineWidth = worn ? 2 : 1;
    roundRect(x, top, CARD.w, CARD.h, 14);
    ctx.stroke();

    // le personnage lui-même, pas une vignette dessinée à part
    ctx.save();
    ctx.translate(x + CARD.w / 2, top + 52);
    ctx.scale(1.3, 1.3);
    ctx.globalAlpha = open ? 1 : 0.25;
    drawAlexandre(s.id, { rising: worn });
    ctx.restore();
    ctx.globalAlpha = 1;

    ctx.font = 'bold 11px ui-rounded, system-ui, sans-serif';
    ctx.fillStyle = open ? '#fdf6ef' : 'rgba(253,246,239,.45)';
    ctx.fillText(s.name, x + CARD.w / 2, top + 94);

    ctx.font = '9px ui-rounded, system-ui, sans-serif';
    if (open) {
      ctx.fillStyle = worn ? '#ffb27a' : 'rgba(253,246,239,.45)';
      drawWrapped(worn ? 'portée' : s.desc, x + CARD.w / 2, top + 107, CARD.w - 12, 10);
    } else {
      ctx.fillStyle = 'rgba(255,178,122,.85)';
      drawWrapped(`🔒 ${s.need}`, x + CARD.w / 2, top + 107, CARD.w - 12, 10);
    }
  });
}

function skinCardAt(event) {
  const { x, y } = pointerPos(event);
  return skinCards.find((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) || null;
}

/* Overlay text. `align: 'bottom'` and a lighter `dim` keep the summit reunion
   visible behind the winning message. */
function panel(lines, { dim = 0.72, align = 'center', button = null } = {}) {
  ctx.fillStyle = `rgba(12, 7, 18, ${dim})`;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  const styleOf = (line) => (Array.isArray(line) ? line[1] : 'body');
  const buttonH = button ? BTN.h + 40 : 0;
  const blockH = lines.reduce((h, line) => h + (styleOf(line) === 'title' ? 58 : 26), 0) + buttonH;
  let y = { bottom: VIEW.h - blockH - 46, top: 54 }[align] ?? VIEW.h / 2 - blockH / 2;
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

  if (button) drawPanelButton(button, y + BTN.h / 2 + 4);
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
  for (const fry of fries) drawFry(fry);
  for (const razor of razors) drawRazor(razor);
  if (state !== 'dead' && state !== 'downed') {
    if (state !== 'cat') drawNoodle();
    drawPlayer();
    if (state !== 'cat') drawShield();
  }
  if (player.trans > 0) drawCracks();
  drawToasts();
  drawHud();
  if (state === 'wheel') drawWheel();
  ctx.restore();

  const climbed = height();
  const taken = MAX_HP - player.hp;
  const hits = `${taken} coup${taken === 1 ? '' : 's'} pris`;

  replayBtn = null;   // seuls les écrans de fin en posent un
  skinCards = [];     // idem : seul l'écran titre en pose

  if (state === 'title') {
    // Le bloc de texte est calé en haut : le bas de l'écran est au sélecteur.
    panel([
      ['ALEXANDRE', 'title'],
      '…et Sabrina, la princesse aux pieds',
      '',
      'Grimpe 500 m. Évite les rasoirs volants.',
      ['Ils coûtent 1 Red Bull sur 3 — et tu as 3 vies.', 'dim'],
      ['Ramasse les canettes, les coupe-ongles, les codes Uber Eats.', 'dim'],
      '',
      ['← → ou A / D pour te diriger · il rebondit tout seul', 'dim'],
    ], { align: 'top' });
    drawSkinPicker(VIEW.h - 168);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 24px ui-rounded, system-ui, sans-serif';
    ctx.fillStyle = '#fdf6ef';
    ctx.fillText('appuie ou tape pour commencer', VIEW.w / 2, VIEW.h - 52);
  } else if (state === 'pause') {
    panel([['PAUSE', 'big'], ['appuie sur P pour reprendre', 'dim']]);
  } else if (state === 'downed') {
    panel([
      [deathReason === 'fall' ? 'Il est tombé.' : 'Les rasoirs l’ont eu.', 'big'],
      [`${lives} ${lives === 1 ? 'vie restante' : 'vies restantes'}`, 'body'],
      ['retour au dernier checkpoint…', 'dim'],
    ], { dim: 0.5, align: 'bottom' });
  } else if (state === 'dead') {
    panel([
      ['AÏE', 'title'],
      deathReason === 'fall' ? 'Alexandre est tombé dans le vide.' : 'Les rasoirs l’ont achevé.',
      ['Plus aucune vie.', 'dim'],
      [`${climbed} m grimpés · record ${best} m`, 'body'],
      '',
      'Sabrina attend toujours.',
    ], { button: 'RÉESSAYER' });
  } else if (state === 'win') {
    panel([
      ['SAUVÉE ! 👑', 'title'],
      'Alexandre rejoint Sabrina.',
      'Elle aussi, en fait, aimait les lunettes.',
      [`${climbed} m grimpés · ${hits}`, 'dim'],
    ], { dim: 0.4, align: 'bottom', button: 'REJOUER' });
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
    // stepPlayer a pu le tuer ou lancer une cinématique : on s'arrête là, sinon
    // un rasoir encore en contact lui coûterait une seconde vie dans la même frame.
    if (state === 'play') {
      stepBonuses();
      stepRazors();
      stepFries();
    }
  } else if (state === 'wheel') {
    stepWheel();
    stepPlatforms();
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

/* Coordonnées VIEW d'un pointeur, quelle que soit la taille affichée du canvas. */
function pointerPos(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * VIEW.w,
    y: ((event.clientY - rect.top) / rect.height) * VIEW.h,
  };
}

function hitsReplay(event) {
  if (!replayBtn) return false;
  const { x, y } = pointerPos(event);
  return x >= replayBtn.x && x <= replayBtn.x + replayBtn.w
    && y >= replayBtn.y && y <= replayBtn.y + replayBtn.h;
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
  // Sur le titre, 1 / 2 / 3 changent de tenue au lieu de lancer la partie.
  if (state === 'title') {
    const slot = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
    if (slot >= 0) {
      if (SKINS[slot]) pickSkin(SKINS[slot].id);
      return;
    }
  }
  // En fin de partie il faut viser le bouton (ou R) : n'importe quelle touche
  // relancerait avant qu'on ait lu son score.
  if (state === 'title') start();
});

window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); touchDir = 0; });

function pointerDir(event) {
  const rect = canvas.getBoundingClientRect();
  return event.clientX - rect.left < rect.width / 2 ? -1 : 1;
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.focus();
  if (state === 'downed' || state === 'cat' || state === 'wheel') return;  // se résolvent seuls
  if (state === 'dead' || state === 'win') {
    if (hitsReplay(event)) start();     // le reste de l'écran ne relance rien
    return;
  }
  if (state === 'title') {
    // Une carte de skin se choisit ; taper à côté lance la partie.
    const card = skinCardAt(event);
    if (card) {
      if (card.open) pickSkin(card.id);
      return;
    }
    start();
    return;
  }
  // With noodles in hand, a tap near a platform reels him in instead of steering.
  if (state === 'play' && player.noodles > 0 && !player.grapple) {
    const { x: wx, y: py } = pointerPos(event);
    const wy = py + camY;
    const plat = platformNear(wx, wy);
    if (plat) {
      startGrapple(plat, wx);
      return;
    }
  }

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

/* ------------------------------------------------- vignettes de la légende

   La légende montre les vrais dessins du jeu : on rejoue les mêmes fonctions de
   rendu dans de petits canvas, plutôt que d'en faire des copies qui
   divergeraient au premier coup de pinceau. */

const SWATCH = { plat: { w: 92, h: 30 }, icon: { w: 42, h: 42 }, skin: { w: 66, h: 80 } };

function drawInto(el, w, h, fn) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  el.width = w * dpr;
  el.height = h * dpr;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  const target = el.getContext('2d');
  target.setTransform(dpr, 0, 0, dpr, 0, 0);
  const live = ctx;
  ctx = target;
  try { fn(); } finally { ctx = live; }
}

function renderLegend() {
  const { plat, icon, skin: card } = SWATCH;

  for (const el of document.querySelectorAll('canvas[data-skin]')) {
    drawInto(el, card.w, card.h, () => {
      ctx.translate(card.w / 2, card.h / 2 + 8);
      ctx.scale(1.15, 1.15);
      drawAlexandre(el.dataset.skin);
    });
  }

  for (const el of document.querySelectorAll('canvas[data-plat]')) {
    drawInto(el, plat.w, plat.h, () => {
      const live = camY;
      camY = -(plat.h - 12);        // la passerelle se pose au bas de la vignette
      drawPlatform({ x: 3, y: 0, w: plat.w - 6, type: el.dataset.plat, dead: false });
      camY = live;
    });
  }

  for (const el of document.querySelectorAll('canvas[data-bonus]')) {
    drawInto(el, icon.w, icon.h, () => {
      ctx.translate(icon.w / 2, icon.h / 2);
      ctx.scale(0.92, 0.92);
      drawBonusIcon(el.dataset.bonus, 0.9);
    });
  }

  for (const el of document.querySelectorAll('canvas[data-meal]')) {
    drawInto(el, icon.w, icon.h, () => {
      ctx.translate(icon.w / 2, icon.h / 2 - 3);
      drawMealIcon(el.dataset.meal, 1.35);
    });
  }
}

setupCanvas();
window.addEventListener('resize', () => { setupCanvas(); renderLegend(); });
loadSkins();
reset();
renderLegend();
requestAnimationFrame(frame);
