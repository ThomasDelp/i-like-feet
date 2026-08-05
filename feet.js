/* Flying feet background.
   Each foot is an emoji glyph drifting across the canvas with its own depth,
   spin and wobble. Depth drives size, speed and opacity so the swarm reads as
   3D-ish without any real 3D. */

const canvas = document.getElementById('feet');
const ctx = canvas.getContext('2d');

const GLYPHS = ['🦶', '👣', '🦶🏽', '🦶🏿', '👣'];
const COUNT = 36;             // la nuée, une bonne fois pour toutes
const SPEED = 1.2;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let width = 0;
let height = 0;
let feet = [];
let speedScale = reduceMotion ? 0.1 : SPEED;
let paused = false;

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

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 16.667, 4); // frames elapsed, clamped after tab switches
  last = now;
  if (!paused) for (const foot of feet) step(foot, dt);
  draw();
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'p') paused = !paused;
});

window.addEventListener('resize', resize);

resize();
feet = Array.from({ length: COUNT }, () => makeFoot(true));

requestAnimationFrame(frame);
