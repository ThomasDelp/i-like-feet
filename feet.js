/* Flying feet background.
   Each foot is an emoji glyph drifting across the canvas with its own depth,
   spin and wobble. Depth drives size, speed and opacity so the swarm reads as
   3D-ish without any real 3D. */

const canvas = document.getElementById('feet');
const ctx = canvas.getContext('2d');

const GLYPHS = ['🦶', '👣', '🦶🏽', '🦶🏿', '👣'];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const ui = {
  count: document.getElementById('count'),
  countOut: document.getElementById('countOut'),
  speed: document.getElementById('speed'),
  speedOut: document.getElementById('speedOut'),
  stomp: document.getElementById('stomp'),
};

let width = 0;
let height = 0;
let feet = [];
let speedScale = Number(ui.speed.value) / 10;
let paused = false;
let settleTimer = null;

const rand = (min, max) => min + Math.random() * (max - min);

function makeFoot(seeded = false) {
  const depth = rand(0.35, 1); // 0 = far away, 1 = right up in your face
  return {
    glyph: GLYPHS[(Math.random() * GLYPHS.length) | 0],
    depth,
    size: 18 + depth * 62,
    x: seeded ? rand(0, width) : rand(-0.1, 1.1) * width,
    y: seeded ? rand(0, height) : height + rand(40, 260),
    vx: rand(-0.35, 0.35) * depth,
    vy: -rand(0.25, 0.9) * depth,
    angle: rand(0, Math.PI * 2),
    spin: rand(-0.012, 0.012),
    wobble: rand(0, Math.PI * 2),
    wobbleRate: rand(0.008, 0.03),
    wobbleAmp: rand(0.4, 1.6),
  };
}

function setCount(n) {
  while (feet.length > n) feet.pop();
  while (feet.length < n) feet.push(makeFoot(true));
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
}

function step(foot, dt) {
  foot.wobble += foot.wobbleRate * dt;
  foot.x += (foot.vx + Math.sin(foot.wobble) * foot.wobbleAmp * 0.25) * speedScale * dt;
  foot.y += foot.vy * speedScale * dt;
  foot.angle += foot.spin * dt;

  const margin = foot.size * 1.5;
  if (foot.y < -margin) {
    // Recycle off the bottom with a fresh identity.
    Object.assign(foot, makeFoot(), { y: height + margin });
  }
  if (foot.x < -margin) foot.x = width + margin;
  if (foot.x > width + margin) foot.x = -margin;
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  for (const foot of feet) {
    ctx.save();
    ctx.translate(foot.x, foot.y);
    ctx.rotate(foot.angle);
    ctx.globalAlpha = 0.18 + foot.depth * 0.55;
    ctx.font = `${foot.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText(foot.glyph, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* Shove every foot away from the middle of the screen. */
function stomp() {
  const cx = width / 2;
  const cy = height / 2;
  for (const foot of feet) {
    const dx = foot.x - cx;
    const dy = foot.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const kick = 6 * foot.depth;
    foot.vx += (dx / dist) * kick;
    foot.vy += (dy / dist) * kick;
    foot.spin += rand(-0.06, 0.06);
  }
  document.body.animate(
    [{ transform: 'translateY(0)' }, { transform: 'translateY(6px)' }, { transform: 'translateY(0)' }],
    { duration: 220, easing: 'ease-out' }
  );
  // Bleed the impulse back off so the swarm settles into its drift again.
  clearInterval(settleTimer);
  settleTimer = setInterval(() => {
    let hot = false;
    for (const foot of feet) {
      foot.vx *= 0.92;
      foot.vy = foot.vy * 0.92 - 0.03 * foot.depth;
      if (Math.abs(foot.vx) > 0.5 || foot.vy > 0) hot = true;
    }
    if (!hot) clearInterval(settleTimer);
  }, 40);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 16.667, 4); // frames elapsed, clamped after tab switches
  last = now;
  if (!paused) for (const foot of feet) step(foot, dt);
  draw();
  requestAnimationFrame(frame);
}

ui.count.addEventListener('input', () => {
  ui.countOut.value = ui.count.value;
  setCount(Number(ui.count.value));
});

ui.speed.addEventListener('input', () => {
  speedScale = Number(ui.speed.value) / 10;
  ui.speedOut.value = `${speedScale.toFixed(1)}×`;
});

ui.stomp.addEventListener('click', stomp);

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && event.target === document.body) {
    event.preventDefault();
    stomp();
  } else if (event.key.toLowerCase() === 'p') {
    paused = !paused;
  }
});

window.addEventListener('resize', resize);

resize();
setCount(Number(ui.count.value));
ui.speedOut.value = `${speedScale.toFixed(1)}×`;

if (reduceMotion) {
  speedScale = 0.1;
  ui.speed.value = 1;
  ui.speedOut.value = '0.1×';
}

requestAnimationFrame(frame);
