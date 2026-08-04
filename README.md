# i-like-feet

Two pages, no build step, no dependencies.

- **Landing page** — a canvas full of flying feet: https://thomasdelp.github.io/i-like-feet/
- **The game** — *Alexandre & the Foot Princess*: https://thomasdelp.github.io/i-like-feet/game.html

## Alexandre & the Foot Princess

A vertical platformer. Alexandre — bald, bespectacled — climbs 500 m to save the
Foot Princess. Flying **ongles** cost him 1 HP out of 3.

| Control | |
| --- | --- |
| <kbd>←</kbd> <kbd>→</kbd> / <kbd>A</kbd> <kbd>D</kbd> | Steer. He bounces on his own. |
| <kbd>P</kbd> · <kbd>R</kbd> · <kbd>M</kbd> | Pause · restart · mute |
| Touch | Hold the left or right half of the canvas |

### Lives and checkpoints

He starts with **3 lives** (up to 5). Running out of HP — or falling below the
screen — costs one and drops him back to the last **green checkpoint ledge** with
full HP and a moment of invulnerability; those ledges are wide, appear every
850 px, fly a flag, and often carry a pickup. The column above a checkpoint is
regenerated on respawn, so the second attempt is never the same climb. Lose the
last life and the run is over.

### Bonuses

Pickups are deliberately sparse: about 4–5 per full climb, on roughly 9% of
platforms (never on moving ones — they'd drift out of sync).

| | | |
| --- | --- | --- |
| ❤️ | **Heart** | +1 HP — or a spare life if he's already whole |
| ✂️ | **Coupe-ongles** | 8 s shield: ongles shatter on contact instead of hurting |
| 🥫 | **Red Bull** | ça donne des ailes — launches him up several platforms |
| 🧑‍🦲 | **1UP** | one more Alexandre, up to five |
| 🐱 | **Nvidia** | the rare one — see below |

### Nvidia

Roughly once every three climbs, Alexandre finds his cat. Everything freezes for
a ~2.4 s cutscene in three beats: he tips out a bowl of croquettes, Nvidia eats,
swells to four times the size in a green aura, then hoists him **200 m** up the
tower on raised paws through a field of speed lines. `assets/nvidia.m4a` plays
over it; the clip is longer than the scene, so it carries on into the resumed
climb and only fades if the run ends or you press <kbd>M</kbd>.

**Platforms:** purple = solid · teal = sliding · orange = cracks after one bounce ·
green = checkpoint · gold = the throne at the summit.

**Under the hood:** one tall world column where `y` grows downward, so climbing is
negative. Platforms are generated procedurally ahead of the camera and culled
behind it; gaps widen and ledges narrow with altitude. Ongle frequency and speed
scale with current altitude, while the score tracks the highest point reached, so
falling never rewinds it. Pickups only attach to static platforms — on moving ones
they'd drift out of sync. Everything — Alexandre, the princess, the ongles, the
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
