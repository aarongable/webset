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

- Tap or click three cards. Multi-touch works, so you can tap all three at once.
- **No Set** deals three more cards, but only if there really is no set on the
  table. A false call is refused silently and counted.
- After a set at 12 cards, three replacements land in the same slots. At 15 or
  more, nothing is dealt and the remaining cards close up.
- The very last card of the deck is dealt face-down. Tap **guess** on it to
  predict its color, number, shape and fill, or reveal it. It can also be used
  in a set while still face-down.
- The game ends when you declare **No Set** with the deck empty, exactly like
  the physical game.
- Timing is recorded but never shown during play. Open the stats view from the
  `⋯` menu (or press `S`).

Keyboard: `Q`–`U`, `A`–`J`, `Z`–`M` select cards by position (rows top to
bottom), `Space` or `N` for No Set, `Esc` clears the selection, `G` opens the
last-card guess.

On phones the table is shown three cards wide with each card turned sideways,
the way you would lay them out on a table in front of you.

## Stats

Everything is stored in `localStorage` under `webset.v1`. The stats view shows
median time to find a set split by whether each attribute was the same or
different across the three cards, by how many attributes differ, all fifteen
kinds, how many sets were available, and a history of finished games. Sets from
abandoned games still count toward the kind analytics.

## Development

```
index.html   markup shell
style.css    layout, card states, dark mode
js/cards.js  card encoding, set logic, SVG rendering
js/game.js   game state machine (no DOM)
js/stats.js  persistence and aggregation
js/ui.js     DOM, input, timing, overlays
tests/       logic tests (node:test style)
tools/       generator for the squiggle path
```

Debug query parameters: `?cards=15` plays with a shorter deck (a multiple of 3,
12–81) so the endgame is quick to reach, and `?seed=N` makes the shuffle
deterministic. `window.webset` exposes the game, stats and clock in the console.

Tests run with `node --test tests/`, or without Node by opening
`tests/run.html` in a browser, for example:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --allow-file-access-from-files --dump-dom "file://$PWD/tests/run.html"
```
