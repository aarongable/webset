const test = require('node:test');
const assert = require('node:assert/strict');
const Cards = require('../js/cards.js');
const { Game } = require('../js/game.js');
const Stats = require('../js/stats.js');

// Deterministic rng for reproducible games.
// A 12-card board containing no set (verified by brute force in a test below).
const CAP12 = [0, 5, 13, 20, 24, 28, 32, 42, 44, 49, 69, 80];

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

test('attrs/fromAttrs round-trip and cover all 81 cards', () => {
  const seen = new Set();
  for (let id = 0; id < 81; id++) {
    const a = Cards.attrs(id);
    assert.equal(Cards.fromAttrs(a), id);
    a.forEach((v) => assert.ok(v >= 0 && v <= 2));
    seen.add(a.join(''));
  }
  assert.equal(seen.size, 81);
});

test('isSet and thirdCard agree', () => {
  let sets = 0;
  for (let a = 0; a < 81; a++) for (let b = a + 1; b < 81; b++) {
    const c = Cards.thirdCard(a, b);
    assert.ok(Cards.isSet(a, b, c));
    assert.notEqual(c, a); assert.notEqual(c, b);
    if (c > b) sets++;
  }
  assert.equal(sets, 1080); // 81*80/6
});

test('findSets on known boards', () => {
  // three all-same-except-number ovals: red solid ovals x1,x2,x3
  const board = [Cards.fromAttrs([0,0,0,0]), Cards.fromAttrs([0,1,0,0]), Cards.fromAttrs([0,2,0,0]), Cards.fromAttrs([1,0,1,1])];
  const sets = Cards.findSets(board);
  assert.deepEqual(sets, [[0,1,2]]);
  // a 12-card board with no set; verify by brute force rather than trusting it
  const cap = CAP12.slice();
  let brute = 0;
  for (let i = 0; i < cap.length; i++) for (let j = i+1; j < cap.length; j++) for (let k = j+1; k < cap.length; k++)
    if (Cards.isSet(cap[i], cap[j], cap[k])) brute++;
  assert.equal(brute, 0);
  assert.equal(Cards.findSets(cap).length, 0);
});

test('kind signature and labels', () => {
  const a = Cards.fromAttrs([0,0,0,0]), b = Cards.fromAttrs([0,1,0,0]), c = Cards.fromAttrs([0,2,0,0]);
  assert.equal(Cards.kind(a, b, c), 0b0010);
  assert.equal(Cards.numDiffering(0b0010), 1);
  assert.equal(Cards.kindLabel(0b1111), 'All different');
  assert.equal(Cards.kindLabel(0b0010), 'Same color, shape, fill');
  assert.equal(Cards.describe(Cards.fromAttrs([2,1,2,1])), 'two striped purple squiggles');
  assert.equal(Cards.describe(Cards.fromAttrs([0,0,0,2])), 'one open red oval');
});

test('new game deals 12 unique cards from a full deck', () => {
  const g = new Game({ rng: lcg(1) });
  assert.equal(g.board.length, 12);
  assert.equal(g.deck.length, 69);
  const all = new Set([...g.ids(), ...g.deck]);
  assert.equal(all.size, 81);
  assert.ok(g.board.every((c) => !c.faceDown));
});

test('finding a set replaces in place at 12 cards, removes at 15', () => {
  const g = new Game({ rng: lcg(2) });
  // force a board with a known set at positions 0,1,2
  g.board[0].id = Cards.fromAttrs([0,0,0,0]);
  g.board[1].id = Cards.fromAttrs([1,1,1,1]);
  g.board[2].id = Cards.fromAttrs([2,2,2,2]);
  const before = g.ids();
  assert.equal(g.toggle(0).type, 'select');
  assert.equal(g.toggle(1).type, 'select');
  const r = g.toggle(2);
  assert.equal(r.type, 'set');
  assert.deepEqual(r.positions, [0,1,2]);
  assert.deepEqual(r.replaced, [0,1,2]);
  assert.equal(g.board.length, 12);
  assert.equal(g.deck.length, 66);
  assert.equal(g.found, 1);
  assert.equal(r.record.kind, 0b1111);
  for (let i = 3; i < 12; i++) assert.equal(g.board[i].id, before[i]);

  // now grow the board to 15 and find a set: no replacement
  g.board.push(g._dealOne(), g._dealOne(), g._dealOne());
  g.board[3].id = Cards.fromAttrs([0,0,0,0]);
  g.board[7].id = Cards.fromAttrs([0,1,0,0]);
  g.board[14].id = Cards.fromAttrs([0,2,0,0]);
  const ids15 = g.ids();
  g.toggle(14); g.toggle(3);
  const r2 = g.toggle(7);
  assert.equal(r2.type, 'set');
  assert.equal(r2.removed, true);
  assert.equal(g.board.length, 12);
  assert.deepEqual(g.ids(), ids15.filter((_, i) => ![3,7,14].includes(i)));
});

test('wrong guess is counted and deselects', () => {
  const g = new Game({ rng: lcg(3) });
  g.board[0].id = Cards.fromAttrs([0,0,0,0]);
  g.board[1].id = Cards.fromAttrs([0,0,0,1]);
  g.board[2].id = Cards.fromAttrs([1,1,1,1]);
  g.toggle(0); g.toggle(1);
  const r = g.toggle(2);
  assert.equal(r.type, 'notset');
  assert.equal(g.wrongGuesses, 1);
  assert.equal(g.selected.length, 0);
  // deselect works
  g.toggle(5);
  assert.equal(g.toggle(5).type, 'deselect');
});

test('noSet refuses when a set exists, deals when none, ends when deck empty', () => {
  const cap = CAP12.slice();
  assert.equal(Cards.findSets(cap).length, 0);
  const rest = [];
  for (let i = 0; i < 81; i++) if (!cap.includes(i)) rest.push(i);
  // deck: pop() deals from the end, so the initial 12 are the last 12 entries.
  const deck = [...rest.slice(0, 3), ...cap.slice().reverse()];
  const g = new Game({ deck });
  assert.deepEqual(g.ids(), cap);
  assert.equal(g.deck.length, 3);
  const r = g.noSet();
  assert.equal(r.ok, true);
  assert.deepEqual(r.dealt, [12,13,14]);
  assert.equal(g.board.length, 15);
  assert.equal(g.deck.length, 0);
  assert.ok(g.board[14].faceDown, 'last card of the deck is face-down');
  assert.equal(g.faceDownPos(), 14);
  assert.equal(g.lastCard.id, rest[0]);

  // a false call when a set exists
  const setsNow = g.setsOnBoard();
  if (setsNow.length > 0) {
    const r2 = g.noSet();
    assert.equal(r2.ok, false);
    assert.equal(g.falseNoSetCalls, 1);
  }
});

test('face-down card can be used in a set and is marked revealed', () => {
  const cap = [[0,0,0,0],[0,1,0,0]].map(Cards.fromAttrs);
  const third = Cards.thirdCard(cap[0], cap[1]);
  // deck of 13: 12 initial cards, then `third` is the final card
  const others = [];
  for (let i = 0; i < 81 && others.length < 10; i++) if (i !== third && !cap.includes(i)) others.push(i);
  const deck = [third, ...others, ...cap.slice().reverse()];
  const g = new Game({ deck });
  // the initial board might contain a set; we just need to deal the last card
  g.board.push(g._dealOne());
  assert.equal(g.board.length, 13);
  assert.ok(g.board[12].faceDown);
  g.toggle(12); g.toggle(0);
  const r = g.toggle(1);
  assert.equal(r.type, 'set');
  assert.equal(r.record.usedFaceDown, true);
  assert.equal(r.removed, true); // board was 13 > 12
  assert.equal(g.lastCard.revealed, true);
  assert.equal(g.lastCard.guess, null);
});

test('reveal scores partial guesses', () => {
  const g = new Game({ rng: lcg(5), deckSize: 12 });
  // deckSize 12 means the 12th dealt card is face-down
  const pos = g.faceDownPos();
  assert.ok(pos >= 0);
  const actual = Cards.attrs(g.lastCard.id);
  const guess = { color: actual[0], number: (actual[1] + 1) % 3, shape: null };
  const r = g.reveal(guess);
  assert.equal(r.pos, pos);
  assert.deepEqual(r.correct, [true, false, null, null]);
  assert.equal(r.numGuessed, 2);
  assert.equal(r.numCorrect, 1);
  assert.ok(!g.board[pos].faceDown);
  assert.equal(g.faceDownPos(), -1);
  // reveal without guess
  const g2 = new Game({ rng: lcg(6), deckSize: 12 });
  const r2 = g2.reveal(null);
  assert.equal(r2.guess, null);
  assert.equal(r2.correct, null);
});

test('game is exhausted when the deck is empty and no set remains', () => {
  const g = new Game({ rng: lcg(7), deckSize: 12 });
  assert.equal(g.exhausted(), false); // 12 random cards almost surely have a set... check honestly
  const cap = CAP12.slice();
  g.board.forEach((c, i) => { c.id = cap[i]; });
  assert.equal(g.exhausted(), true);
  const r = g.noSet();
  assert.deepEqual(r, { ok: true, gameOver: true });
  assert.equal(g.over, true);
  assert.equal(g.toggle(0), null);
  // not exhausted while cards remain in the deck, even with no set on the table
  const g2 = new Game({ rng: lcg(8) });
  g2.board.forEach((c, i) => { c.id = cap[i]; });
  g2.deck = g2.deck.filter((id) => !cap.includes(id));
  assert.equal(g2.exhausted(), false);
});

test('dealing is fair: about two thirds of games need an extra deal', () => {
  // Plays full games with the real rules. With a fair shuffle roughly 67% of
  // games hit a 12-card board with no set at least once (simulated: 67%).
  const N = 300;
  let needed = 0;
  for (let i = 0; i < N; i++) {
    const g = new Game({ rng: lcg(1000 + i) });
    let any = false, guard = 0;
    while (!g.over && guard++ < 200) {
      const sets = g.setsOnBoard();
      if (!sets.length) {
        const r = g.noSet();
        if (r.gameOver) break;
        any = true;
        continue;
      }
      sets[0].forEach((p) => g.toggle(p));
      if (g.exhausted()) break;
    }
    if (any) needed++;
  }
  const frac = needed / N;
  assert.ok(frac > 0.5 && frac < 0.85, `fraction needing a deal was ${frac}`);
});

test('endgame factory leaves 12 cards reachable by removing valid sets', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = Game.endgame({ rng: lcg(seed) });
    assert.ok(g, 'construction succeeded');
    assert.equal(g.board.length, 12);
    assert.equal(g.deck.length, 0);
    assert.equal(g.found, 23);
    assert.equal(g.removedSets.length, 23);
    assert.equal(g.board.filter((c) => c.faceDown).length, 1, 'exactly one face-down card');
    assert.ok(g.board[11].faceDown, 'the last card dealt is face-down');
    assert.ok(g.lastCard && g.lastCard.id === g.board[11].id);
    const seen = new Set(g.ids());
    for (const [a, b, c] of g.removedSets) {
      assert.ok(Cards.isSet(a, b, c), `removed triple is a set: ${a},${b},${c}`);
      for (const x of [a, b, c]) { assert.ok(!seen.has(x), 'card appears once'); seen.add(x); }
    }
    assert.equal(seen.size, 81, 'board plus removed sets is the whole deck');
    // consequence: each attribute sums to 0 mod 3 across the 12 leftovers
    const sums = [0, 0, 0, 0];
    g.ids().forEach((id) => Cards.attrs(id).forEach((v, i) => { sums[i] += v; }));
    sums.forEach((v) => assert.equal(v % 3, 0));
  }
});

test('stats aggregations', () => {
  assert.equal(Stats.median([5, 1, 3]), 3);
  assert.equal(Stats.median([4, 1, 3, 2]), 2.5);
  assert.equal(Stats.median([]), null);
  assert.equal(Stats.mean([2, 4]), 3);
  const sets = [
    { ms: 1000, kind: 0b1111, setsAvailable: 1 },
    { ms: 3000, kind: 0b0001, setsAvailable: 2 },
    { ms: 5000, kind: 0b0011, setsAvailable: 5 },
  ];
  const byAttr = Stats.byAttributeSameVsDiff(sets);
  assert.equal(byAttr[0].attr, 'color');
  assert.equal(byAttr[0].diff.n, 3);       // color differs in all three
  assert.equal(byAttr[0].same.n, 0);
  assert.equal(byAttr[2].attr, 'shape');
  assert.equal(byAttr[2].same.n, 2);       // shape same in kinds 0001 and 0011
  assert.equal(byAttr[2].same.median, 4000);
  const byN = Stats.byNumDiffering(sets);
  assert.deepEqual(byN.map((b) => b.differing), [1,2,3,4]);
  assert.equal(byN[0].median, 3000);
  assert.equal(byN[3].median, 1000);
  const byKind = Stats.byKind(sets);
  assert.equal(byKind.length, 15);
  assert.equal(byKind.find((k) => k.kind === 0b0011).median, 5000);
  const avail = Stats.bySetsAvailable(sets);
  assert.deepEqual(avail.map((a) => [a.label, a.n]), [['1',1],['2',1],['3+',1]]);
});

test('stats storage round-trips through a fake localStorage', () => {
  const mem = new Map();
  const fake = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const s = new Stats.Stats(fake);
  const g = s.startGame(1000);
  g.sets.push({ at: 1500, ms: 500, kind: 3 });
  s.persist();
  const s2 = new Stats.Stats(fake);
  assert.equal(s2.store.games.length, 1);
  assert.equal(s2.store.games[0].sets[0].ms, 500);
  assert.equal(s2.finishedGames().length, 0);
  const sum = Stats.gameSummary(s2.store.games[0]);
  assert.equal(sum.setsFound, 1);
  assert.equal(sum.finished, false);
  // empty games are dropped on abandon
  const s3 = new Stats.Stats(fake);
  s3.startGame(2000);
  s3.abandonIfEmpty();
  assert.equal(new Stats.Stats(fake).store.games.length, 1);
  s3.clearAll();
  assert.equal(new Stats.Stats(fake).store.games.length, 0);
});
