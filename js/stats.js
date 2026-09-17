// Persistence and analytics for Set practice sessions.

(function (root) {
  'use strict';

  const Cards = root.Cards || (typeof require === 'function' ? require('./cards.js') : null);
  const KEY = 'webset.v1';

  // ---- math helpers -----------------------------------------------------

  function mean(xs) {
    if (!xs.length) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }

  function median(xs) {
    if (!xs.length) return null;
    const s = xs.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function summary(xs) {
    return { n: xs.length, median: median(xs), mean: mean(xs), min: xs.length ? Math.min(...xs) : null, max: xs.length ? Math.max(...xs) : null };
  }

  // ---- aggregations over set records -------------------------------------
  // A set record: {at, ms, kind, boardSize, deckRemaining, setsAvailable,
  //                wrongGuesses, falseNoSetCalls, usedFaceDown, cards}

  function byAttributeSameVsDiff(sets) {
    return Cards.ATTRS.map((attr, i) => {
      const same = [], diff = [];
      for (const s of sets) ((s.kind & (1 << i)) ? diff : same).push(s.ms);
      return { attr, label: Cards.ATTR_LABELS[attr], same: summary(same), diff: summary(diff) };
    });
  }

  function byNumDiffering(sets) {
    const buckets = [[], [], [], [], []];
    for (const s of sets) buckets[Cards.numDiffering(s.kind)].push(s.ms);
    return [1, 2, 3, 4].map((n) => ({ differing: n, ...summary(buckets[n]) }));
  }

  function byKind(sets) {
    const buckets = new Map();
    for (const s of sets) {
      if (!buckets.has(s.kind)) buckets.set(s.kind, []);
      buckets.get(s.kind).push(s.ms);
    }
    const out = [];
    for (let sig = 1; sig < 16; sig++) {
      out.push({ kind: sig, label: Cards.kindLabel(sig), numDiffering: Cards.numDiffering(sig), ...summary(buckets.get(sig) || []) });
    }
    return out;
  }

  function bySetsAvailable(sets) {
    const b = { 1: [], 2: [], '3+': [] };
    for (const s of sets) {
      const k = s.setsAvailable >= 3 ? '3+' : String(s.setsAvailable);
      if (b[k]) b[k].push(s.ms);
    }
    return Object.keys(b).map((k) => ({ label: k, ...summary(b[k]) }));
  }

  // ---- bias analytics ------------------------------------------------------
  // These compare what you chose with what was on the table. Each set record
  // carries availableKinds: the kind signature of every set that existed at
  // that moment (including the one found). Records without it are skipped.

  function withAvailability(sets) {
    return sets.filter((s) => Array.isArray(s.availableKinds) && s.availableKinds.length > 0);
  }

  // For each attribute: among finds where both a "same" and a "different" set
  // were available, how often did you pick "same", versus the share of "same"
  // among the options (what random picking would give)?
  function biasByAttribute(sets) {
    return Cards.ATTRS.map((attr, i) => {
      const bit = 1 << i;
      let n = 0, chosenSame = 0, expectedSame = 0;
      for (const s of withAvailability(sets)) {
        const same = s.availableKinds.filter((k) => !(k & bit)).length;
        const diff = s.availableKinds.length - same;
        if (!same || !diff) continue;
        n++;
        expectedSame += same / s.availableKinds.length;
        if (!(s.kind & bit)) chosenSame++;
      }
      return { attr, label: Cards.ATTR_LABELS[attr], n, chosenSame: n ? chosenSame / n : null, expectedSame: n ? expectedSame / n : null };
    });
  }

  // Share chosen vs share available for 1..4 differing attributes, over finds
  // where more than one distinct count was available.
  function biasByNumDiffering(sets) {
    const chosen = [0, 0, 0, 0, 0], expected = [0, 0, 0, 0, 0];
    let n = 0;
    for (const s of withAvailability(sets)) {
      const counts = [0, 0, 0, 0, 0];
      for (const k of s.availableKinds) counts[Cards.numDiffering(k)]++;
      if (counts.filter((c) => c > 0).length < 2) continue;
      n++;
      for (let d = 1; d <= 4; d++) expected[d] += counts[d] / s.availableKinds.length;
      chosen[Cards.numDiffering(s.kind)]++;
    }
    return [1, 2, 3, 4].map((d) => ({ differing: d, n, chosen: n ? chosen[d] / n : null, expected: n ? expected[d] / n : null }));
  }

  // Per kind: how many times chosen vs how many times expected under random
  // picking (sum of availability shares), over finds where alternatives existed.
  function biasByKind(sets) {
    const chosen = new Map(), expected = new Map(), seen = new Map();
    for (const s of withAvailability(sets)) {
      const L = s.availableKinds.length;
      const distinct = new Set(s.availableKinds);
      for (const k of distinct) {
        const c = s.availableKinds.filter((x) => x === k).length;
        expected.set(k, (expected.get(k) || 0) + c / L);
        seen.set(k, (seen.get(k) || 0) + 1);
      }
      chosen.set(s.kind, (chosen.get(s.kind) || 0) + 1);
    }
    const out = [];
    for (let sig = 1; sig < 16; sig++) {
      const e = expected.get(sig) || 0, c = chosen.get(sig) || 0;
      out.push({ kind: sig, label: Cards.kindLabel(sig), numDiffering: Cards.numDiffering(sig), timesAvailable: seen.get(sig) || 0, chosen: c, expected: e, ratio: e > 0 ? c / e : null });
    }
    return out;
  }

  // Finds where exactly one set was on the table: a speed measure that is not
  // confounded by choice.
  function soloSets(sets) {
    return sets.filter((s) => s.setsAvailable === 1);
  }

  function gameSummary(game) {
    const times = game.sets.map((s) => s.ms);
    const s = summary(times);
    let fastest = null, slowest = null;
    for (const set of game.sets) {
      if (!fastest || set.ms < fastest.ms) fastest = set;
      if (!slowest || set.ms > slowest.ms) slowest = set;
    }
    let lastCard = null;
    if (game.lastCardGuess) {
      const c = game.lastCardGuess.correct;
      lastCard = c ? { guessed: c.filter((x) => x !== null).length, correct: c.filter((x) => x === true).length } : { guessed: 0, correct: 0 };
    }
    return {
      id: game.id,
      startedAt: game.startedAt,
      finishedAt: game.finishedAt,
      finished: !!game.finishedAt,
      totalMs: game.totalMs || 0,
      setsFound: game.sets.length,
      medianMs: s.median,
      meanMs: s.mean,
      fastest, slowest,
      wrongGuesses: game.wrongGuesses || 0,
      falseNoSetCalls: game.falseNoSetCalls || 0,
      lastCard,
      cardsLeft: game.cardsLeft == null ? null : game.cardsLeft,
    };
  }

  function allSets(games) {
    const out = [];
    for (const g of games) for (const s of g.sets) out.push(s);
    return out;
  }

  // ---- storage ------------------------------------------------------------

  function emptyStore() { return { version: 1, games: [] }; }

  function load(storage) {
    storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!storage) return emptyStore();
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return emptyStore();
      const data = JSON.parse(raw);
      if (!data || data.version !== 1 || !Array.isArray(data.games)) return emptyStore();
      return data;
    } catch (e) {
      return emptyStore();
    }
  }

  function save(store, storage) {
    storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!storage) return false;
    try { storage.setItem(KEY, JSON.stringify(store)); return true; } catch (e) { return false; }
  }

  function clear(storage) {
    storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (storage) try { storage.removeItem(KEY); } catch (e) { /* ignore */ }
  }

  function newGameRecord(now) {
    return {
      id: String(now) + '-' + Math.floor(Math.random() * 1e6).toString(36),
      startedAt: now,
      finishedAt: null,
      totalMs: 0,
      sets: [],
      deals: [],
      wrongGuesses: 0,
      falseNoSetCalls: 0,
      lastCardGuess: null,
      cardsLeft: null,
    };
  }

  // Convenience: a store bound to a storage backend that tracks the current game.
  class Stats {
    constructor(storage) {
      this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      this.store = load(this.storage);
      this.current = null;
    }
    startGame(now) {
      this.current = newGameRecord(now);
      this.store.games.push(this.current);
      // keep the store bounded
      if (this.store.games.length > 500) this.store.games.splice(0, this.store.games.length - 500);
      this.persist();
      return this.current;
    }
    persist() { return save(this.store, this.storage); }
    // Drop the current game if it has no recorded sets (nothing worth keeping).
    abandonIfEmpty() {
      if (this.current && this.current.sets.length === 0 && !this.current.finishedAt) {
        const i = this.store.games.indexOf(this.current);
        if (i >= 0) this.store.games.splice(i, 1);
        this.current = null;
        this.persist();
      }
    }
    finishedGames() { return this.store.games.filter((g) => g.finishedAt); }
    allSets() { return allSets(this.store.games); }
    clearAll() { this.store = emptyStore(); this.current = null; clear(this.storage); }
  }

  const api = {
    KEY, mean, median, summary,
    byAttributeSameVsDiff, byNumDiffering, byKind, bySetsAvailable, gameSummary, allSets,
    withAvailability, biasByAttribute, biasByNumDiffering, biasByKind, soloSets,
    load, save, clear, newGameRecord, Stats,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StatsLib = api;
})(typeof window !== 'undefined' ? window : globalThis);
