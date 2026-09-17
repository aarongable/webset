// DOM glue: board rendering and sizing, input, timing, overlays.

(function () {
  'use strict';

  const $ = (sel, el) => (el || document).querySelector(sel);
  const ASPECT = Cards.CARD_W / Cards.CARD_H;
  const KEY_ROWS = ['qwertyu', 'asdfghj', 'zxcvbnm'];
  const FOUND_MS = 420, FLIP_MS = 500, WRONG_MS = 350;

  // ---- clock ---------------------------------------------------------------
  // Tracks active time for the whole game and for the current "lap" (time since
  // the board last changed). Pauses are reference-counted by reason.
  class Clock {
    constructor() { this.totalAcc = 0; this.lapAcc = 0; this.since = null; this.pauses = new Set(); this.running = false; }
    _flush() {
      if (this.since !== null) {
        const now = performance.now();
        this.totalAcc += now - this.since; this.lapAcc += now - this.since; this.since = now;
      }
    }
    start() { this.totalAcc = 0; this.lapAcc = 0; this.running = true; this.since = this.pauses.size ? null : performance.now(); }
    stop() { this._flush(); this.running = false; this.since = null; }
    total() { this._flush(); return this.totalAcc; }
    lap() { this._flush(); return this.lapAcc; }
    mark() { this._flush(); this.lapAcc = 0; }
    pause(reason) { this._flush(); this.pauses.add(reason); this.since = null; }
    resume(reason) {
      this.pauses.delete(reason);
      if (!this.pauses.size && this.running && this.since === null) this.since = performance.now();
    }
  }

  // ---- state ---------------------------------------------------------------
  const params = new URLSearchParams(location.search);
  let deckSize = parseInt(params.get('cards'), 10);
  if (!(deckSize >= 12 && deckSize <= 81 && deckSize % 3 === 0)) deckSize = 81;
  let rng = null;
  if (params.has('seed')) {
    let s = (parseInt(params.get('seed'), 10) || 1) >>> 0;
    rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  const stats = new StatsLib.Stats();
  const clock = new Clock();
  let game = null;
  let locked = false;
  let guessPick = null;
  let guessFinal = false;

  const board = $('#board');
  const foundEl = $('#found'), leftEl = $('#left');
  const noSetBtn = $('#no-set');
  const menuBtn = $('#menu-btn'), menu = $('#menu');
  const guessOverlay = $('#guess-overlay'), overOverlay = $('#over-overlay'), statsOverlay = $('#stats-overlay');

  $('#svg-defs').innerHTML = Cards.stripeDefsSVG() +
    '<pattern id="stripes-neutral" patternUnits="userSpaceOnUse" width="100" height="10" style="color:var(--icon-neutral)">' +
    '<line x1="0" y1="5" x2="100" y2="5" stroke="currentColor" stroke-width="2.6"/></pattern>';

  // ---- helpers -------------------------------------------------------------
  function fmtMs(ms) {
    if (ms === null || ms === undefined || !isFinite(ms)) return '—';
    const s = ms / 1000;
    if (s < 60) return s.toFixed(1) + 's';
    const m = Math.floor(s / 60), r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(0);
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function show(el) { el.hidden = false; const b = el.querySelector('.btn.primary, .btn'); if (b) b.focus({ preventScroll: true }); }
  function hide(el) { el.hidden = true; }
  function anyOverlayOpen() { return !guessOverlay.hidden || !overOverlay.hidden || !statsOverlay.hidden; }
  function setKbd(on) { document.body.classList.toggle('kbd', on); }

  // ---- board rendering -------------------------------------------------------
  function cardEl(pos) {
    const c = game.board[pos];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card' + (c.faceDown ? ' face-down' : '');
    b.dataset.pos = pos;
    b.dataset.id = c.id;
    b.setAttribute('aria-label', c.faceDown ? 'Face-down card' : Cards.describe(c.id));
    b.innerHTML = Cards.renderCardSVG(c.id, { faceDown: c.faceDown }) +
      '<span class="key" aria-hidden="true"></span>' +
      (c.faceDown ? '<span class="guess-chip" data-chip role="button" aria-label="Guess the last card">guess</span>' : '');
    return b;
  }

  function renderBoard() {
    board.replaceChildren(...game.board.map((_, i) => cardEl(i)));
    fit();
    syncSelection();
  }

  function syncSelection() {
    for (const el of board.children) el.classList.toggle('selected', game.selected.includes(+el.dataset.pos));
  }

  function renumber() {
    Array.from(board.children).forEach((el, i) => { el.dataset.pos = i; });
  }

  function fit() {
    if (!game) return;
    const n = game.board.length;
    const portrait = window.innerWidth < window.innerHeight;
    board.dataset.mode = portrait ? 'portrait' : 'landscape';
    const rect = board.getBoundingClientRect();
    const pad = 12;
    const gap = Math.max(6, Math.round(Math.min(rect.width, rect.height) * 0.02));
    const availW = Math.max(0, rect.width - pad * 2), availH = Math.max(0, rect.height - pad * 2);
    const lines = Math.max(4, Math.ceil(n / 3));
    let w, h;
    if (!portrait) {
      const cols = lines, rows = 3;
      w = Math.min((availW - gap * (cols - 1)) / cols, ((availH - gap * (rows - 1)) / rows) * ASPECT);
      h = w / ASPECT;
    } else {
      const cols = 3, rows = lines;
      w = Math.min((availW - gap * (cols - 1)) / cols, ((availH - gap * (rows - 1)) / rows) / ASPECT);
      h = w * ASPECT;
    }
    w = Math.max(20, Math.floor(w)); h = Math.max(20, Math.floor(h));
    board.style.setProperty('--card-w', w + 'px');
    board.style.setProperty('--card-h', h + 'px');
    board.style.setProperty('--gap', gap + 'px');
    board.style.setProperty('--card-r', Math.round((portrait ? w : h) * 18 / 225) + 'px');
    updateKeyHints();
  }

  function updateKeyHints() {
    for (const el of board.children) {
      const p = +el.dataset.pos, col = Math.floor(p / 3), row = p % 3;
      const k = col < 7 ? KEY_ROWS[row][col] : '';
      const span = el.querySelector('.key');
      if (span) span.textContent = k.toUpperCase();
    }
  }

  function updateStatus() {
    foundEl.textContent = game.found;
    leftEl.textContent = game.deck.length;
    noSetBtn.disabled = game.over;
  }

  // Rebuild the board after cards were removed, sliding survivors into place.
  function rebuildWithFlip() {
    const before = new Map();
    for (const el of board.children) before.set(el.dataset.id, el.getBoundingClientRect());
    renderBoard();
    for (const el of board.children) {
      const b = before.get(el.dataset.id);
      if (!b) continue;
      const a = el.getBoundingClientRect();
      const dx = b.left - a.left, dy = b.top - a.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform .3s ease';
        el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; }, 320);
      });
    }
  }

  function flipToFace(el, id) {
    el.classList.remove('face-down');
    el.classList.add('flip');
    setTimeout(() => {
      const chip = el.querySelector('.guess-chip');
      if (chip) chip.remove();
      el.querySelector('svg').outerHTML = Cards.renderCardSVG(id);
      el.setAttribute('aria-label', Cards.describe(id));
    }, FLIP_MS / 2);
    setTimeout(() => el.classList.remove('flip'), FLIP_MS);
  }

  // ---- game flow --------------------------------------------------------------
  function newGame() {
    if (stats.current && !stats.current.finishedAt) {
      stats.abandonIfEmpty();
      if (stats.current) {
        stats.current.totalMs = Math.round(clock.total());
        stats.current.cardsLeft = game ? game.board.length : null;
        stats.persist();
      }
    }
    game = new Game({ deckSize, rng });
    stats.startGame(Date.now());
    locked = false;
    hide(guessOverlay); hide(overOverlay); hide(statsOverlay); closeMenu();
    clock.pauses.clear();
    if (document.hidden) clock.pauses.add('hidden');
    renderBoard();
    updateStatus();
    clock.start();
  }

  function tap(pos) {
    if (locked || !game || game.over) return;
    const ms = clock.lap();
    const r = game.toggle(pos);
    if (!r) return;
    if (r.type === 'select' || r.type === 'deselect') { syncSelection(); return; }
    if (r.type === 'notset') { onWrong(r.positions); return; }
    onSet(r, ms);
  }

  function onWrong(positions) {
    locked = true;
    stats.current.wrongGuesses = game.wrongGuesses;
    stats.persist();
    const els = positions.map((p) => board.children[p]);
    els.forEach((el) => { el.classList.remove('selected'); el.classList.add('wrong'); });
    setTimeout(() => { els.forEach((el) => el.classList.remove('wrong')); locked = false; }, WRONG_MS);
  }

  function onSet(r, ms) {
    locked = true;
    clock.pause('anim');
    const rec = Object.assign({ at: Date.now(), ms: Math.round(ms) }, r.record);
    stats.current.sets.push(rec);
    stats.current.wrongGuesses = game.wrongGuesses;
    stats.current.falseNoSetCalls = game.falseNoSetCalls;
    if (r.record.usedFaceDown && !stats.current.lastCardGuess) {
      stats.current.lastCardGuess = { guess: null, actual: Cards.attrs(game.lastCard.id), correct: null, usedInSet: true };
    }
    stats.persist();

    const els = r.positions.map((p) => board.children[p]);
    let delay = 0;
    els.forEach((el) => {
      el.classList.remove('selected');
      if (el.classList.contains('face-down')) { flipToFace(el, +el.dataset.id); delay = FLIP_MS; }
    });
    setTimeout(() => els.forEach((el) => el.classList.add('found')), delay);
    setTimeout(() => {
      if (r.replaced.length) {
        r.positions.forEach((p) => {
          const el = cardEl(p);
          el.classList.add('dealt');
          board.replaceChild(el, board.children[p]);
        });
        fit();
      } else {
        rebuildWithFlip();
      }
      updateStatus();
      locked = false;
      clock.resume('anim');
      clock.mark();
      if (game.boardEmpty()) endGame();
    }, delay + FOUND_MS);
  }

  function doNoSet() {
    if (locked || !game || game.over) return;
    const lap = clock.lap();
    const r = game.noSet();
    if (!r) return;
    syncSelection();
    if (!r.ok) {
      stats.current.falseNoSetCalls = game.falseNoSetCalls;
      stats.persist();
      noSetBtn.classList.remove('shake');
      void noSetBtn.offsetWidth; // restart the animation
      noSetBtn.classList.add('shake');
      setTimeout(() => noSetBtn.classList.remove('shake'), WRONG_MS);
      return;
    }
    if (r.gameOver) { endGame(); return; }
    stats.current.deals.push({ at: Date.now(), noSetMs: Math.round(lap), boardSizeAfter: game.board.length });
    stats.persist();
    r.dealt.forEach((p) => { const el = cardEl(p); el.classList.add('dealt'); board.appendChild(el); });
    fit();
    updateStatus();
    clock.mark();
  }

  function endGame() {
    game.finish();
    locked = true;
    clock.stop();
    stats.current.finishedAt = Date.now();
    stats.current.totalMs = Math.round(clock.total());
    stats.current.cardsLeft = game.board.length;
    stats.persist();
    updateStatus();
    if (game.faceDownPos() >= 0) openGuess(true);
    else showSummary();
  }

  // ---- last card guess panel --------------------------------------------------
  const guessRows = $('#guess-rows'), guessResult = $('#guess-result');
  const guessClose = $('#guess-close'), guessReveal = $('#guess-reveal'), guessDone = $('#guess-done');

  function iconFor(attr, v) {
    const spec = { color: null, number: 0, shape: 0, fill: 0 };
    spec[attr] = v;
    return Cards.renderSymbolIconSVG(spec);
  }

  function openGuess(final) {
    if (game.faceDownPos() < 0) return;
    guessFinal = final;
    guessPick = { color: null, number: null, shape: null, fill: null };
    $('#guess-intro').textContent = final
      ? 'The deck is done. Guess the last card before it turns over?'
      : 'Guess what it is, or just reveal it. You can also use it in a set as-is.';
    guessRows.innerHTML = Cards.ATTRS.map((attr) =>
      `<div class="guess-row" data-attr="${attr}"><span class="label">${Cards.ATTR_LABELS[attr]}</span>` +
      [0, 1, 2].map((v) =>
        `<button type="button" class="choice" data-v="${v}" aria-pressed="false" aria-label="${Cards.VALUES[attr][v]}">${iconFor(attr, v)}</button>`
      ).join('') +
      `<span class="mark" aria-live="polite"></span></div>`
    ).join('');
    guessResult.hidden = true;
    guessResult.textContent = '';
    guessReveal.hidden = false;
    guessDone.hidden = true;
    guessClose.hidden = final;
    clock.pause('overlay');
    show(guessOverlay);
  }

  guessRows.addEventListener('click', (e) => {
    const btn = e.target.closest('.choice');
    if (!btn || btn.disabled) return;
    const row = btn.closest('.guess-row'), attr = row.dataset.attr, v = +btn.dataset.v;
    const on = btn.getAttribute('aria-pressed') !== 'true';
    row.querySelectorAll('.choice').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', String(on));
    guessPick[attr] = on ? v : null;
  });

  guessReveal.addEventListener('click', () => {
    const any = Object.values(guessPick).some((v) => v !== null);
    const r = game.reveal(any ? guessPick : null);
    if (!r) return;
    stats.current.lastCardGuess = { guess: r.guess, actual: r.actual, correct: r.correct };
    stats.persist();
    const el = board.children[r.pos];
    if (el) flipToFace(el, r.id);
    Cards.ATTRS.forEach((attr, i) => {
      const row = guessRows.querySelector(`[data-attr="${attr}"]`);
      row.querySelectorAll('.choice').forEach((b) => {
        b.disabled = true;
        if (+b.dataset.v === r.actual[i]) b.classList.add('actual');
      });
      const mark = row.querySelector('.mark');
      if (r.correct && r.correct[i] !== null) {
        mark.textContent = r.correct[i] ? '✓' : '✗';
        mark.className = 'mark ' + (r.correct[i] ? 'ok' : 'no');
      }
    });
    guessResult.hidden = false;
    guessResult.textContent = r.numGuessed
      ? `${r.numCorrect} of ${r.numGuessed} right. It was ${Cards.describe(r.id)}.`
      : `It was ${Cards.describe(r.id)}.`;
    guessReveal.hidden = true;
    guessClose.hidden = true;
    guessDone.hidden = false;
    guessDone.focus();
  });

  function closeGuess() {
    hide(guessOverlay);
    clock.resume('overlay');
    if (guessFinal) showSummary();
  }
  guessClose.addEventListener('click', closeGuess);
  guessDone.addEventListener('click', closeGuess);

  // ---- game over summary -----------------------------------------------------
  function lastCardText(g) {
    const lc = g.lastCardGuess;
    if (!lc) return game && game.lastCard ? 'left face-down' : '—';
    if (lc.usedInSet) return 'used in a set, unguessed';
    if (!lc.correct) return 'revealed without guessing';
    const guessed = lc.correct.filter((c) => c !== null).length;
    const right = lc.correct.filter((c) => c === true).length;
    return `${right} of ${guessed} guessed right`;
  }

  function showSummary() {
    const g = stats.current;
    const s = StatsLib.gameSummary(g);
    const rows = [
      ['Sets found', String(s.setsFound)],
      ['Total time', fmtMs(s.totalMs)],
      ['Median per set', fmtMs(s.medianMs)],
      ['Mean per set', fmtMs(s.meanMs)],
      s.fastest ? ['Fastest', `${fmtMs(s.fastest.ms)} <span class="sub">${Cards.kindLabel(s.fastest.kind)}</span>`] : null,
      s.slowest && s.setsFound > 1 ? ['Slowest', `${fmtMs(s.slowest.ms)} <span class="sub">${Cards.kindLabel(s.slowest.kind)}</span>`] : null,
      ['Wrong guesses', String(s.wrongGuesses)],
      ['False “No Set” calls', String(s.falseNoSetCalls)],
      ['Last card', lastCardText(g)],
      ['Cards left over', String(s.cardsLeft == null ? '—' : s.cardsLeft)],
    ].filter(Boolean);
    $('#over-body').innerHTML = '<dl class="kv">' + rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') + '</dl>';
    show(overOverlay);
  }
  $('#over-new').addEventListener('click', newGame);
  $('#over-stats').addEventListener('click', () => { hide(overOverlay); openStats(true); });

  // ---- stats view ---------------------------------------------------------------
  let statsReturnToSummary = false;

  function bar(value, max, cls) {
    const pct = max > 0 && value != null ? Math.max(1.5, (value / max) * 100) : 0;
    return `<div class="track"><div class="fill" style="width:${pct.toFixed(1)}%;background:var(--${cls})"></div></div>`;
  }
  function val(sum) {
    return sum.n ? `${fmtMs(sum.median)} <small>· ${sum.n}</small>` : '<small>—</small>';
  }

  function renderStats() {
    const sets = stats.allSets();
    const games = stats.finishedGames();
    const body = $('#stats-body');
    if (!sets.length) {
      body.innerHTML = '<p class="empty">No sets recorded yet. Go find some.</p>';
      return;
    }
    const allTimes = sets.map((s) => s.ms);
    const finishedSums = games.map(StatsLib.gameSummary).filter((s) => s.setsFound >= 3);
    const best = finishedSums.length ? Math.min(...finishedSums.map((s) => s.medianMs)) : null;

    let html = '<div class="tiles">' +
      `<div class="tile"><span class="v">${games.length}</span><span class="l">games finished</span></div>` +
      `<div class="tile"><span class="v">${sets.length}</span><span class="l">sets found</span></div>` +
      `<div class="tile"><span class="v">${fmtMs(StatsLib.median(allTimes))}</span><span class="l">median time per set</span></div>` +
      `<div class="tile"><span class="v">${fmtMs(best)}</span><span class="l">best game median</span></div>` +
      '</div>';

    // By attribute: same vs different
    const byAttr = StatsLib.byAttributeSameVsDiff(sets);
    const maxAttr = Math.max(...byAttr.flatMap((a) => [a.same.median || 0, a.diff.median || 0]));
    html += '<div class="section"><h3>Which kinds of sets slow you down</h3>' +
      '<p class="hint">Median time to find a set, split by whether each attribute is the same or different across the three cards.</p>' +
      '<div class="legend"><span><i style="background:var(--series-1)"></i>Same</span><span><i style="background:var(--series-2)"></i>Different</span></div>' +
      byAttr.map((a) =>
        `<div class="attr-group"><span class="l">${a.label}</span><div class="pair">` +
        `<div class="row" title="${a.label} same: median ${fmtMs(a.same.median)}, ${a.same.n} sets">${bar(a.same.median, maxAttr, 'series-1')}<span class="v">${val(a.same)}</span></div>` +
        `<div class="row" title="${a.label} different: median ${fmtMs(a.diff.median)}, ${a.diff.n} sets">${bar(a.diff.median, maxAttr, 'series-2')}<span class="v">${val(a.diff)}</span></div>` +
        `</div></div>`
      ).join('') + '</div>';

    // By number of differing attributes
    const byN = StatsLib.byNumDiffering(sets);
    const maxN = Math.max(...byN.map((b) => b.median || 0));
    html += '<div class="section"><h3>By how many attributes differ</h3>' +
      '<p class="hint">One differing attribute means three otherwise identical cards; four means everything differs.</p><div class="hbars">' +
      byN.map((b) =>
        `<div class="hbar" title="${b.differing} differing: median ${fmtMs(b.median)}, ${b.n} sets"><span class="l">${b.differing} differ${b.differing === 1 ? 's' : ''}</span>${bar(b.median, maxN, 'series-1')}<span class="v">${val(b)}</span></div>`
      ).join('') + '</div></div>';

    // Full kinds table
    const kinds = StatsLib.byKind(sets).slice().sort((a, b) => (b.median || -1) - (a.median || -1));
    html += '<div class="section"><h3>All fifteen kinds</h3><p class="hint">Slowest first. Kinds seen fewer than three times are greyed out.</p><div class="table-wrap"><table class="table">' +
      '<thead><tr><th>Kind</th><th class="num">Differ</th><th class="num">Sets</th><th class="num">Median</th><th class="num">Fastest</th></tr></thead><tbody>' +
      kinds.map((k) =>
        `<tr class="${k.n < 3 ? 'dim' : ''}"><td>${k.label}</td><td class="num">${k.numDiffering}</td><td class="num">${k.n}</td><td class="num">${fmtMs(k.median)}</td><td class="num">${fmtMs(k.min)}</td></tr>`
      ).join('') + '</tbody></table></div></div>';

    // Sets available
    const avail = StatsLib.bySetsAvailable(sets);
    const maxA = Math.max(...avail.map((b) => b.median || 0));
    html += '<div class="section"><h3>By how many sets were on the table</h3><div class="hbars">' +
      avail.map((b) =>
        `<div class="hbar" title="${b.label} sets available: median ${fmtMs(b.median)}, ${b.n} sets"><span class="l">${b.label} available</span>${bar(b.median, maxA, 'series-1')}<span class="v">${val(b)}</span></div>`
      ).join('') + '</div></div>';

    // Game history
    html += '<div class="section"><h3>Games</h3>';
    if (!games.length) {
      html += '<p class="hint">No finished games yet. Play a deck to the end to see it here.</p>';
    } else {
      const sums = games.map(StatsLib.gameSummary);
      if (sums.length >= 2) html += sparkline(sums.map((s) => s.medianMs || 0));
      html += '<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th class="num">Sets</th><th class="num">Time</th><th class="num">Median</th><th class="num">Wrong</th><th class="num">False calls</th><th>Last card</th></tr></thead><tbody>' +
        sums.slice().reverse().slice(0, 40).map((s, i, arr) => {
          const g = games[games.length - 1 - i];
          return `<tr><td>${fmtDate(s.finishedAt)}</td><td class="num">${s.setsFound}</td><td class="num">${fmtMs(s.totalMs)}</td><td class="num">${fmtMs(s.medianMs)}</td><td class="num">${s.wrongGuesses}</td><td class="num">${s.falseNoSetCalls}</td><td>${lastCardText(g)}</td></tr>`;
        }).join('') + '</tbody></table></div>';
    }
    html += '</div>';
    body.innerHTML = html;
  }

  function sparkline(values) {
    const w = 600, h = 56, pad = 6;
    const max = Math.max(...values), min = Math.min(...values);
    const x = (i) => pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2);
    const y = (v) => max === min ? h / 2 : pad + (1 - (v - min) / (max - min)) * (h - pad * 2);
    const d = values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    const last = values.length - 1;
    return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Median time per set across games"><path d="${d}"/><circle cx="${x(last).toFixed(1)}" cy="${y(values[last]).toFixed(1)}" r="4"/></svg>`;
  }

  function openStats(fromSummary) {
    statsReturnToSummary = !!fromSummary;
    renderStats();
    clock.pause('overlay');
    show(statsOverlay);
    statsOverlay.scrollTop = 0;
  }
  function closeStats() {
    hide(statsOverlay);
    clock.resume('overlay');
    if (statsReturnToSummary) { statsReturnToSummary = false; show(overOverlay); }
  }
  $('#stats-close').addEventListener('click', closeStats);
  $('#stats-clear').addEventListener('click', () => {
    if (!confirm('Delete all recorded games and set times? This cannot be undone.')) return;
    stats.clearAll();
    stats.startGame(Date.now());
    renderStats();
  });

  // ---- menu ----------------------------------------------------------------------
  function openMenu() { menu.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); }
  function closeMenu() { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.menu-item');
    if (!item) return;
    closeMenu();
    if (item.dataset.action === 'stats') openStats(false);
    if (item.dataset.action === 'new') newGame();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !e.target.closest('.menu-wrap')) closeMenu();
  });

  // ---- input ----------------------------------------------------------------------
  board.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const chip = e.target.closest('[data-chip]');
    if (chip) { e.preventDefault(); e.stopPropagation(); if (!locked && !anyOverlayOpen()) openGuess(false); return; }
    const card = e.target.closest('.card');
    if (!card) return;
    e.preventDefault();
    if (e.pointerType !== 'mouse') setKbd(false);
    tap(+card.dataset.pos);
  });
  // Keyboard activation of a focused card (pointer clicks are handled above).
  board.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    const chip = e.target.closest('[data-chip]');
    if (chip) { openGuess(false); return; }
    const card = e.target.closest('.card');
    if (card) tap(+card.dataset.pos);
  });
  board.addEventListener('contextmenu', (e) => e.preventDefault());

  noSetBtn.addEventListener('click', doNoSet);

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (anyOverlayOpen()) {
      if (k === 'escape') {
        if (!statsOverlay.hidden) closeStats();
        else if (!guessOverlay.hidden && !guessClose.hidden) closeGuess();
      }
      return;
    }
    if (!menu.hidden) { if (k === 'escape') closeMenu(); return; }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (k === ' ' || k === 'n') { e.preventDefault(); doNoSet(); return; }
    if (k === 'escape') { game.clearSelection(); syncSelection(); return; }
    if (k === 's') { openStats(false); return; }
    if (k === 'g') { openGuess(false); return; }
    for (let r = 0; r < 3; r++) {
      const c = KEY_ROWS[r].indexOf(k);
      if (c >= 0) {
        const pos = c * 3 + r;
        if (pos < game.board.length) { setKbd(true); tap(pos); }
        e.preventDefault();
        return;
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clock.pause('hidden'); else clock.resume('hidden');
  });
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(board);

  // ---- go -------------------------------------------------------------------------
  newGame();

  // Debug hooks for the console and tests. dealExtra() deals three cards
  // regardless of whether a set is on the table (for layout checks).
  function dealExtra() {
    if (!game || game.over || game.deck.length < 3) return;
    const dealt = [];
    for (let i = 0; i < 3; i++) { game.board.push(game._dealOne()); dealt.push(game.board.length - 1); }
    dealt.forEach((p) => { const el = cardEl(p); el.classList.add('dealt'); board.appendChild(el); });
    fit(); updateStatus(); clock.mark();
  }
  window.webset = { get game() { return game; }, stats, clock, newGame, fit, dealExtra };
})();
