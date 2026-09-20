# webset

A web app for practicing the card game Set. Play it at
https://aarongable.github.io/webset/. Install it as a PWA for offline play.

The cards are as precise a replica of the 1998 deck (the one I grew up
with) as I could get. This does sacrifice some readability of thin lines
on a small phone screen, but the graphical fidelity it worth it to me.

The last card is always dealt face-down. This is a house rule based on
the number theoretic properties of Set: you can always determine precisely
what card it is by considering each feature one-by-one. You can enter a
guess for what the last card is, or if it is part of a set you can use it
directly without having to reveal it first!

Also features extensive stats to track your own biases in set-finding, and
to track your improvement over time.

# Deployment

Simply open `index.html` in a browser. Pushes to `main` automatically
deploy to GitHub Pages.

## Testing

Run `node --test tests/`, or open `tests/run.html` in a browser (headless
Chrome with `--dump-dom` works).

Debug switches:
- `?cards=15` for a short deck
- `?seed=N` for a fixed shuffle
- `Ctrl`+`Shift`+`E` to jump to the last 12 cards of a deck without
  recording stats.
