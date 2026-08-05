# i-like-feet

Two pages, no build step, no dependencies.

- **Landing page** — a canvas full of flying feet (just the swarm and a link to
  the game; <kbd>P</kbd> pauses it): https://thomasdelp.github.io/i-like-feet/
- **The game** — *Alexandre & Sabrina, the Foot Princess*: https://thomasdelp.github.io/i-like-feet/game.html

## Alexandre & Sabrina, the Foot Princess

A vertical platformer, **in French**. Alexandre — bald, bespectacled — climbs
500 m to save **Sabrina**, the Foot Princess. Flying **rasoirs** (razors) cost him one of
his three Red Bulls (the HP bar is a row of cans).

| Control | |
| --- | --- |
| <kbd>←</kbd> <kbd>→</kbd> / <kbd>A</kbd> <kbd>D</kbd> | Steer. He bounces on his own. |
| <kbd>P</kbd> · <kbd>R</kbd> · <kbd>M</kbd> | Pause · restart · mute |
| Touch | Hold the left or right half of the canvas |

### Lives and checkpoints

He starts with **3 lives** (up to 5). Running out of HP — or falling below the
screen — costs one and sends him back to his last checkpoint with full HP and a
moment of invulnerability.

There is exactly **one checkpoint**: a wide, flagged green ledge halfway up at
250 m. Below it, dying means starting the climb again from the ground; once
banked, that ledge is where every later death returns him. The column above a
respawn point is regenerated, so the second attempt is never the same climb.
Lose the last life and the run is over.

### Bonuses

Pickups are deliberately sparse: about 3–4 per full climb, on roughly 7% of
platforms (never on moving ones — they'd drift out of sync).

| | | |
| --- | --- | --- |
| ✂️ | **Coupe-ongles** | 8 s shield: razors shatter on contact instead of hurting |
| 🥫 | **Red Bull** | +1 HP — or a spare life if he's already full |
| 🧑‍🦲 | **1UP** | one more Alexandre, up to five |
| 🧴 | **Crème pour un crâne luisant** | the rarest — see below |
| 🛍️ | **Uber Eats** | a code redeemed for one of three random meals — see below |
| 🐱 | **Nvidia** | the rare one — see below |

### Uber Eats

Collecting the code freezes the game for a slot-machine spin: a reel of dishes
decelerates and stops exactly on the one drawn, lever and blinking bulbs
included, then serves it.

| | | |
| --- | --- | --- |
| 🍛 | **Indien** | 3.4 s of curry propulsion — he farts, and it lifts him at a steady climb, olive plume included |
| 🍜 | **Nouilles** | 3 grapples: click or tap a ledge and a noodle reels him to it, Spider-Man style. Anchors track moving ledges; a tap away from any ledge still steers |
| 🍟 | **Frites** | 4.5 s of eating badly: fries spray out ahead of him, and each one destroys a razor on contact, destroying itself too |

### Crème pour un crâne luisant

The rarest pickup (~0.35% of eligible platforms). His scalp turns so shiny it
splits the world: the screen fractures along nine frozen crack lines, the theme
flips to a cream-and-lavender transcendence, **intermediate ledges** appear
wherever a gap exceeds 78 px, and he loses his glasses for white, shiny eyes.
Nothing radiates out of him — the shine stays inside the eye. Twelve seconds
later the cracks heal, the ghost ledges evaporate and the tower goes back to
normal. Losing a life mid-transcendence clears the ghost ledges too.

### Nvidia

Roughly once every two climbs, Alexandre finds his cat. Everything freezes for
a ~2.4 s cutscene in three beats: he tips out a bowl of croquettes, Nvidia eats,
swells to four times the size in a green aura, then hoists him **200 m** up the
tower on raised paws through a field of speed lines. `assets/nvidia.m4a` plays
over it; the clip is longer than the scene, so it carries on into the resumed
climb and only fades if the run ends or you press <kbd>M</kbd>.

**Platforms:** purple = solid · teal = sliding · orange = cracks after one
bounce · **yellow = trampoline, launching him twice as high** · green = the
single checkpoint at 250 m · gold = the throne at the summit · translucent white
= transcendence-only intermediate ledges.

**Language:** the app is entirely in French; this README is the English dev doc.

**Under the hood:** one tall world column where `y` grows downward, so climbing is
negative. Platforms are generated procedurally ahead of the camera and culled
behind it; gaps widen and ledges narrow with altitude. Ongle frequency and speed
scale with current altitude, while the score tracks the highest point reached, so
falling never rewinds it. Pickups only attach to static platforms — on moving ones
they'd drift out of sync. Everything — Alexandre, the princess, the razors, the
pickups, the HUD — is drawn with canvas primitives; the only audio is a few
WebAudio oscillator blips.

## Files

| | |
| --- | --- |
| `index.html` / `styles.css` / `feet.js` | Landing page and its flying-feet background |
| `game.html` / `game.css` / `game.js` | The game |

## Running locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/ — or just open `index.html` directly.

## Deploying

GitHub Pages serves `main` at the repository root. Push to `main` and it redeploys.
