// Pure game state for Set. No DOM, no timers. The UI layer supplies
// elapsed-time measurements when recording events.

(function (root) {
  'use strict';

  const Cards = root.Cards || (typeof require === 'function' ? require('./cards.js') : null);

  function defaultRng() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      return () => { crypto.getRandomValues(buf); return buf[0] / 4294967296; };
    }
    return Math.random;
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  class Game {
    // opts.deckSize: number of cards to play with (multiple of 3, >= 12).
    // opts.rng: function returning [0,1). opts.deck: explicit card order (top of deck last).
    constructor(opts) {
      opts = opts || {};
      const rng = opts.rng || defaultRng();
      let deck;
      if (opts.deck) {
        deck = opts.deck.slice();
      } else {
        deck = shuffle(Array.from({ length: 81 }, (_, i) => i), rng);
        const size = opts.deckSize || 81;
        deck = deck.slice(0, size);
      }
      this.deck = deck;            // pop() deals from the end
      this.board = [];             // [{id, faceDown}]
      this.selected = [];          // board positions
      this.found = 0;
      this.over = false;
      this.wrongGuesses = 0;       // totals for the game
      this.falseNoSetCalls = 0;
      this.intervalWrong = 0;      // since the board last changed
      this.intervalFalseNoSet = 0;
      this.lastCard = null;        // {id, revealed, guess, correct} once dealt face-down
      for (let i = 0; i < 12 && this.deck.length; i++) this.board.push(this._dealOne());
    }

    _dealOne() {
      const id = this.deck.pop();
      const faceDown = this.deck.length === 0;
      if (faceDown) this.lastCard = { id, revealed: false, guess: null, correct: null };
      return { id, faceDown };
    }

    ids() { return this.board.map((c) => c.id); }

    setsOnBoard() { return Cards.findSets(this.ids()); }

    faceDownPos() { return this.board.findIndex((c) => c.faceDown); }

    _boardChanged() {
      this.intervalWrong = 0;
      this.intervalFalseNoSet = 0;
    }

    // Toggle selection of a board position. Returns one of:
    //  {type:'select'|'deselect', pos}
    //  {type:'set', positions, record, replaced: [pos...] , removed: bool}
    //  {type:'notset', positions}
    toggle(pos) {
      if (this.over || pos < 0 || pos >= this.board.length) return null;
      const i = this.selected.indexOf(pos);
      if (i >= 0) {
        this.selected.splice(i, 1);
        return { type: 'deselect', pos };
      }
      this.selected.push(pos);
      if (this.selected.length < 3) return { type: 'select', pos };
      return this._attempt();
    }

    clearSelection() { this.selected = []; }

    _attempt() {
      const positions = this.selected.slice().sort((a, b) => a - b);
      this.selected = [];
      const [a, b, c] = positions.map((p) => this.board[p].id);
      if (!Cards.isSet(a, b, c)) {
        this.wrongGuesses++;
        this.intervalWrong++;
        return { type: 'notset', positions };
      }
      const usedFaceDown = positions.some((p) => this.board[p].faceDown);
      const ids = this.ids();
      const availableKinds = Cards.findSets(ids).map(([i, j, k]) => Cards.kind(ids[i], ids[j], ids[k]));
      const record = {
        cards: [a, b, c],
        kind: Cards.kind(a, b, c),
        boardSize: this.board.length,
        deckRemaining: this.deck.length,
        setsAvailable: availableKinds.length,
        availableKinds,
        wrongGuesses: this.intervalWrong,
        falseNoSetCalls: this.intervalFalseNoSet,
        usedFaceDown,
      };
      if (usedFaceDown && this.lastCard && !this.lastCard.revealed) {
        this.lastCard.revealed = true; // left the board unguessed
      }
      this.found++;
      let replaced = [], removed = false;
      if (this.board.length <= 12 && this.deck.length > 0) {
        for (const p of positions) this.board[p] = this._dealOne();
        replaced = positions;
      } else {
        for (let k = positions.length - 1; k >= 0; k--) this.board.splice(positions[k], 1);
        removed = true;
      }
      this._boardChanged();
      return { type: 'set', positions, record, replaced, removed };
    }

    // Player declares there is no set. Returns
    //  {ok:false} when a set exists,
    //  {ok:true, dealt:[pos...]} when cards were dealt,
    //  {ok:true, gameOver:true} when the deck is empty and the board has no set.
    noSet() {
      if (this.over) return null;
      this.selected = [];
      if (this.setsOnBoard().length > 0) {
        this.falseNoSetCalls++;
        this.intervalFalseNoSet++;
        return { ok: false };
      }
      if (this.deck.length === 0) {
        this.over = true;
        return { ok: true, gameOver: true };
      }
      const dealt = [];
      for (let i = 0; i < 3 && this.deck.length; i++) {
        this.board.push(this._dealOne());
        dealt.push(this.board.length - 1);
      }
      this._boardChanged();
      return { ok: true, dealt };
    }

    // True when the deck is empty and no set remains: the game is over.
    exhausted() { return this.deck.length === 0 && this.setsOnBoard().length === 0; }

    finish() { this.over = true; }

    // Reveal the face-down card. guess is null or {color, number, shape, fill}
    // with each value 0..2 or null (not guessed). Returns
    // {id, actual:[4], guess:[4]|null, correct:[bool|null x4], numCorrect, numGuessed}.
    reveal(guess) {
      const pos = this.faceDownPos();
      if (pos < 0 || !this.lastCard) return null;
      this.board[pos].faceDown = false;
      const actual = Cards.attrs(this.lastCard.id);
      let g = null, correct = null, numCorrect = 0, numGuessed = 0;
      if (guess) {
        g = Cards.ATTRS.map((a) => (guess[a] === undefined ? null : guess[a]));
        correct = g.map((v, i) => (v === null ? null : v === actual[i]));
        numGuessed = correct.filter((c) => c !== null).length;
        numCorrect = correct.filter((c) => c === true).length;
        if (numGuessed === 0) { g = null; correct = null; }
      }
      this.lastCard.revealed = true;
      this.lastCard.guess = g;
      this.lastCard.correct = correct;
      return { pos, id: this.lastCard.id, actual, guess: g, correct, numCorrect, numGuessed };
    }
  }

  // A game that starts at the last 12 cards of the deck. It is built by
  // shuffling a full deck and repeatedly removing a random valid set until 12
  // cards remain, so the leftovers are exactly what a real game could reach.
  // The removed sets are kept on `removedSets` for inspection. The final card
  // dealt is face-down as usual. Returns null only if construction keeps
  // getting stuck (a set-free remainder above 12 cards), which is very rare.
  Game.endgame = function (opts) {
    opts = opts || {};
    const rng = opts.rng || defaultRng();
    for (let attempt = 0; attempt < 200; attempt++) {
      const remaining = shuffle(Array.from({ length: 81 }, (_, i) => i), rng);
      const removed = [];
      while (remaining.length > 12) {
        const sets = Cards.findSets(remaining);
        if (!sets.length) break;
        const [i, j, k] = sets[Math.floor(rng() * sets.length)];
        removed.push([remaining[i], remaining[j], remaining[k]]);
        remaining.splice(k, 1); remaining.splice(j, 1); remaining.splice(i, 1);
      }
      if (remaining.length !== 12) continue;
      const g = new Game({ deck: remaining });
      g.found = removed.length;
      g.removedSets = removed;
      return g;
    }
    return null;
  };

  const api = { Game, shuffle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
