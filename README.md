# webset

A distraction-free web app for practicing the card game Set, with cards drawn
to look like the original deck and local analytics on which kinds of sets you
find quickly or slowly.

## Play

Open `index.html` directly in a browser, or serve the directory:

```
python3 -m http.server
```

No build step, no dependencies. Everything is plain HTML, CSS and JavaScript.

Served over HTTPS (GitHub Pages works) it is an installable PWA: a service
worker caches the app so it opens offline, and the manifest gives it a home
screen icon. Use the browser's install option (or Share → Add to Home Screen
on iOS). When opened straight from disk the service worker is skipped.

- Tap or click three cards. Multi-touch works, so you can tap all three at once.
- **No Set** deals three more cards, but only if there really is no set on the
  table. A false call is refused silently and counted.
- After a set at 12 cards, three replacements land in the same slots. At 15 or
  more, nothing is dealt and the remaining cards close up.
- The very last card of the deck is dealt face-down. Tap **guess** on it to
  predict its color, number, shape and fill, or reveal it. It can also be used
  in a set while still face-down.
- The game ends on its own once the deck is empty and no set remains, and a
  summary of the game appears.
- Timing is recorded but never shown during play. Open the stats view from the
  `⋯` menu (or press `S`). The pause button blurs the table and stops the
  clock; the clock also pauses whenever the tab is hidden.

Keyboard: `Q`–`U`, `A`–`J`, `Z`–`M` select cards by position (rows top to
bottom), `Space` or `N` for No Set, `P` pauses, `Esc` clears the selection,
`G` opens the last-card guess.

On phones the table is shown three cards wide with each card turned sideways,
the way you would lay them out on a table in front of you.

## Stats

Everything is stored in `localStorage` under `webset.v1`. The stats view is
built to expose biases in which sets you find. Every time you find a set, the
app records the kind of every set that was on the table at that moment, so it
can compare what you chose with what was available:

- **What you reach for**: for each attribute, how often you took the set where
  that attribute was the same, against how often random picking among the
  available sets would have. Only finds where both kinds were on offer count.
- **By how many attributes differ**: the same comparison for sets with one,
  two, three or four differing attributes.
- **Speed when there was only one set**: median time by kind, restricted to
  finds where no other set existed, so the time is about the set and not
  about your choice.
- **All fifteen kinds**: times chosen against times expected, as a ratio.
- A history of finished games.

Sets from abandoned games still count toward the kind analytics.

## Development

```
index.html   markup shell
style.css    layout, card states, dark mode
manifest.webmanifest, sw.js, icons/   PWA manifest, service worker, icons
js/cards.js  card encoding, set logic, SVG rendering
js/game.js   game state machine (no DOM)
js/stats.js  persistence and aggregation
js/ui.js     DOM, input, timing, overlays
tests/       logic tests (node:test style)
tools/       photo tracer, measurement and comparison pages, squiggle converter
```

Debug query parameters: `?cards=15` plays with a shorter deck (a multiple of 3,
12–81) so the endgame is quick to reach, and `?seed=N` makes the shuffle
deterministic. `window.webset` exposes the game, stats and clock in the console.

`Ctrl`+`Shift`+`E` starts a test game at the last 12 cards of a deck, with the
final card face-down and nothing recorded to stats. The state is built by
shuffling a full deck and removing 23 random valid sets, so the leftovers are
exactly what a real game could end with.

Card geometry (symbol shapes, sizes, spacing, outline, stripes) and ink
colours were measured from a photograph of the owner's 1998 deck with the
pages in `tools/`: `trace_squiggle.html` traces an outline, `measure_card.html`
reports symbol extents and spacing, `sample_colors.html` reads white-balanced
ink colours, and `compare_cards.html` shows real cards beside rendered ones.
They expect the photo, rotated to landscape, as `tools/deck_1998.jpg` (not
checked in). The numbers are in the comments of `tools/squiggle.py` and
`js/cards.js`; the traced squiggle outline is `tools/squiggle_trace.json`.

After changing any shipped file, bump `CACHE` in `sw.js` so installed copies
pick up the new version. Icons are regenerated with `tools/icons.py` and
rasterized by screenshotting the SVGs in headless Chrome at 512, 192 and 180
pixels.

Tests run with `node --test tests/`, or without Node by opening
`tests/run.html` in a browser, for example:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --allow-file-access-from-files --dump-dom "file://$PWD/tests/run.html"
```
