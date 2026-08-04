# i-like-feet

A single-page site whose background is a canvas full of flying feet.

**Live:** https://thomasdelp.github.io/i-like-feet/

## What's in it

- `index.html` — the page (title, tagline, controls)
- `styles.css` — gradient backdrop, glass panel, layout
- `feet.js` — the canvas animation: emoji feet with per-foot depth, drift, spin and wobble

## Controls

| Control | What it does |
| --- | --- |
| Feet in flight | 4–120 feet on screen |
| Flight speed | 0.1×–4× drift speed |
| Stomp (or <kbd>space</kbd>) | Blasts every foot away from the centre, then lets them settle |
| <kbd>P</kbd> | Pause / resume |

Honours `prefers-reduced-motion` by starting at a near-standstill drift.

## Running locally

No build step, no dependencies — open `index.html`, or serve the folder:

```sh
python3 -m http.server 8000
```

## Deploying

GitHub Pages serves `main` at the repository root. Push to `main` and it redeploys.
