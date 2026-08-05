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
| <kbd>Space</kbd> / <kbd>↑</kbd> / <kbd>W</kbd> | **Double jump** — one mid-air backflip, recharged on every bounce |
| <kbd>P</kbd> · <kbd>R</kbd> · <kbd>M</kbd> | Pause · restart · mute |
| <kbd>H</kbd> or the <kbd>?</kbd> button | The help sheet, over the game — it pauses the run |
| Touch | Hold the left or right half to steer, **tap briefly** to flip |
| <kbd>1</kbd> … <kbd>9</kbd> | Pick a skin, on the title screen — or click its card |
| <kbd>T</kbd> | Back to the skin picker from anywhere — also a **Tenues** button on the end screens |
| Game over / win | Hit the on-canvas **Rejouer** button (armed after ~0.8 s) or <kbd>R</kbd> — a stray tap anywhere else no longer wipes the score off the screen |

### Double jump

One extra jump in the air, spent per bounce and recharged by `land()`, so it
rescues a misjudged gap instead of replacing the bounce. `AIR_JUMP` is a shade
weaker than `JUMP`. It animates as a full **backflip** over `FLIP_TIME` frames —
`drawPlayer()` rotates around the body's middle, before the `face` mirror and
against it, so his head goes back over his shoulder whichever way he is facing —
plus a dust ring that stays where he pushed off (`rings`, drawn under him and
fading as it widens) and a downward burst. Two green chevrons in the HUD say
whether it is still in hand.

On touch, a press under `TAP_TIME` that never drifts past `TAP_SLOP` is a flip;
anything longer is the steering hold it always was, and a tap near a platform
still goes to the noodle grapple when he has one.

### Full screen and the help sheet

On a phone (`max-width: 860px`, and tall enough to be portrait) the canvas takes
the whole window at scale 1: the field is as wide as the device and a taller
screen **reveals more tower** rather than zooming. `setupCanvas()` writes the new
size into `VIEW`, and a rotation mid-run calls `refitWorld()` so platforms,
bonuses and Alexandre are pulled back inside the new width. Desktop keeps the
480 × 720 column, scaled by CSS.

The legend used to sit beside the canvas; it is now a sheet over the game, opened
by the round **?** in the corner (or <kbd>H</kbd>) and closed with ✕, <kbd>Esc</kbd>
or a click on the veil. Opening it pauses a live run and closing it resumes —
unless the pause was yours.

### Skins

Nine outfits, picked on the title screen — click a card, or press
<kbd>1</kbd>…<kbd>9</kbd>. The choice and the unlocks are kept in
`localStorage`, so they survive the tab. `skinLayout()` balances the cards into
rows of at most five and shrinks them to fit the width (nine come out 5 + 4);
`skinPickerHeight()` reports the block's height so the title screen can sit it
above the prompt.

| | | |
| --- | --- | --- |
| **Le classique** | black tee, brown trousers | free |
| **La princesse** | boxers, pink butterfly wings that beat faster as he rises, and a crown | reach **250 m** |
| **Le super-héros** | swim trunks with the Mistral M on the front | **save Sabrina without losing a life** |
| **Le blouson** | leather jacket zipped across, grey tee at the collar, jeans | reach **100 m** |
| **Le capitaine** | white tee, black shorts, black life vest | **save Sabrina**, whatever it cost |
| **L’hiver** | black beanie, black coat, blue-and-black scarf with red stripes | reach **400 m** |
| **Le pyjama** | striped, buttoned, with slippers | **meet Nvidia**, his cat |
| **Le gala** | navy blazer worn open, white shirt, no tie, cognac belt, caramel dress shoes | reach the throne with **all 3 Red Bulls** |
| **Stanislas** | brown hair swept over the forehead, red hoodie — hood down, ecru drawstrings, kangaroo pocket, white tee at the collar — and beige chinos | get **a meal off the Uber Eats wheel** |

An unlock is announced on the end screen that earned it, in gold: the toast it
also fires is drawn under the panel and at the player's position, where nobody
sees it. The **Tenues** button beside *Rejouer* — or <kbd>T</kbd> — goes back to
the picker, so a skin can be worn without reloading the page.

Locked cards are dimmed and show what they cost. Unlock conditions are declared
next to each skin and evaluated by `checkUnlocks()` — from the play loop for
altitude and for the cat (`player.metCat`, set when the cutscene starts), and
from `win()` for the two that hang on the summit, since those can only be judged
once. The character is drawn by one `drawAlexandre(skin, pose)`, so the picker
cards and the legend show the real thing rather than a portrait maintained on
the side. Each garment is a flag on the skin (`jacket`, `blazer`, `hoodie`,
`vest`, `coat`, `beanie`, `hair`, `scarf`, `stripes`, `hipShorts`) with its own
small draw function, so outfits mix rather than each one forking the body. `bodyW` /
`bodyH` widen or lengthen the torso — a coat hangs lower, an oversized hoodie
spreads — and `sleeveColor` lets a jacket keep its own sleeves over a white
shirt.

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
| 🍛 | **Indien** | 3.4 s of curry propulsion — he farts, and it lifts him at a steady climb, olive plume included. It never carries him past the throne: at the summit the jet cuts out and he drops onto it |
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
a ~2.8 s cutscene in four beats: he tips out a bowl of croquettes, Nvidia eats,
swells to four times the size in a green aura, hoists him **200 m** up the tower
on raised paws through a field of speed lines — and then **throws him onto a
platform** rather than letting go over a gap. `catLandingPlat()` picks the
nearest solid ledge below the top of the ride (never a fragile one, never the
throne) and builds one if the tower offers nothing; the target is re-read every
frame of the toss, since a sliding platform is no longer where it was when the
cat let fly. He arrives just above it and bounces. `assets/nvidia.m4a` plays over
the scene; the clip is longer than it, so it carries on into the resumed climb
and only fades if the run ends or you press <kbd>M</kbd>.

**Platforms:** purple = solid · teal = sliding · orange = cracks after one
bounce · **yellow = trampoline, launching him twice as high** · green = the
single checkpoint at 250 m · gold = the throne at the summit · translucent white
= transcendence-only intermediate ledges. The legend beside the game doesn't
name those colours: it paints each ledge and each pickup into a small canvas
with the game's own drawing functions, so the swatches can never drift from
what's on screen.

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
