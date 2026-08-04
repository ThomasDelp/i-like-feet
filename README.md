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

**Platforms:** purple = solid · teal = sliding · orange = cracks after one bounce ·
gold = the throne at the summit. Fall below the screen and it's over — the camera
never comes back down.

**Under the hood:** one tall world column where `y` grows downward, so climbing is
negative. Platforms are generated procedurally ahead of the camera and culled
behind it; gaps widen and ledges narrow with altitude. Ongle frequency and speed
scale with height too. Score is the highest point reached, so falling never
rewinds it. Everything — Alexandre, the princess, the ongles, the HUD — is drawn
with canvas primitives; the only audio is a few WebAudio oscillator blips.

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
