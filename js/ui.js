// DOM glue: board rendering and sizing, input, timing, overlays.

(function () {
  'use strict';

  const $ = (sel, el) => (el || document).querySelector(sel);
  const ASPECT = Cards.CARD_W / Cards.CARD_H;
  const KEY_ROWS = ['qwertyu', 'asdfghj', 'zxcvbnm'];
  const FOUND_MS = 160, FLIP_MS = 500, WRONG_MS = 450;

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
  let ephemeral = false; // test game: its record is never written to storage

  const board = $('#board');
  const leftEl = $('#left'), testFlag = $('#test-flag');
  const noSetBtn = $('#no-set'), pauseBtn = $('#pause-btn'), pauseOverlay = $('#pause-overlay');
  const menuBtn = $('#menu-btn'), menu = $('#menu');
  const guessOverlay = $('#guess-overlay'), overOverlay = $('#over-overlay'), statsOverlay = $('#stats-overlay');

  $('#svg-defs').innerHTML = Cards.stripeDefsSVG() +
    `<pattern id="stripes-neutral" patternUnits="userSpaceOnUse" width="100" height="${Cards.STRIPE_PITCH}" style="color:var(--icon-neutral)">` +
    `<line x1="0" y1="${Cards.STRIPE_PITCH / 2}" x2="100" y2="${Cards.STRIPE_PITCH / 2}" stroke="currentColor" stroke-width="${Cards.STRIPE_WIDTH}"/></pattern>`;

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
  function anyOverlayOpen() { return !guessOverlay.hidden || !overOverlay.hidden || !statsOverlay.hidden || !pauseOverlay.hidden; }
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

  // Which physical edge of the device is the portrait "bottom" once the phone
  // is turned to landscape. screen.orientation.angle is the counter-clockwise
  // rotation from the natural (portrait) orientation: 90 puts that edge on the
  // right, 270 on the left.
  function landscapeSide() {
    const forced = params.get('side');
    if (forced === 'left' || forced === 'right') return forced; // debug override
    let angle = window.screen && window.screen.orientation ? window.screen.orientation.angle : window.orientation;
    if (typeof angle !== 'number') return 'right';
    angle = ((angle % 360) + 360) % 360;
    return angle === 270 ? 'left' : 'right';
  }

  function applyLayout() {
    const portrait = window.innerWidth < window.innerHeight;
    const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
    const layout = portrait ? 'portrait' : phone ? 'landscape-phone' : 'landscape';
    document.body.dataset.layout = layout;
    document.body.dataset.side = layout === 'landscape-phone' ? landscapeSide() : '';
    board.dataset.mode = portrait ? 'portrait' : 'landscape';
    return portrait;
  }

  function fit() {
    if (!game) return;
    const n = game.board.length;
    const portrait = applyLayout();
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
    leftEl.textContent = game.deck.length;
    noSetBtn.disabled = game.over;
    pauseBtn.disabled = game.over;
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
  // Attach a stats record for the game in progress. Ephemeral (test) games get
  // a detached record that is never stored.
  function attachRecord() {
    if (ephemeral) stats.current = StatsLib.newGameRecord(Date.now());
    else stats.startGame(Date.now());
  }

  function newGame(opts) {
    opts = opts || {};
    if (stats.current && !stats.current.finishedAt && !ephemeral) {
      stats.abandonIfEmpty();
      if (stats.current) {
        stats.current.totalMs = Math.round(clock.total());
        stats.current.cardsLeft = game ? game.board.length : null;
        stats.persist();
      }
    }
    ephemeral = !!opts.endgame;
    game = opts.endgame ? Game.endgame({ rng }) : null;
    if (!game) { ephemeral = false; game = new Game({ deckSize, rng }); }
    attachRecord();
    testFlag.hidden = !ephemeral;
    locked = false;
    hide(guessOverlay); hide(overOverlay); hide(statsOverlay); closeMenu();
    setPaused(false);
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

  // ---- pause -------------------------------------------------------------------
  function setPaused(on) {
    if (on) {
      if (!game || game.over || anyOverlayOpen()) return;
      clock.pause('paused');
      document.body.classList.add('paused');
      pauseOverlay.hidden = false;
    } else {
      if (pauseOverlay.hidden) return;
      pauseOverlay.hidden = true;
      document.body.classList.remove('paused');
      clock.resume('paused');
    }
  }
  pauseBtn.addEventListener('click', () => setPaused(true));
  pauseOverlay.addEventListener('pointerdown', (e) => { e.preventDefault(); setPaused(false); });

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
    $('#over-body').innerHTML = '<dl class="kv">' + rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') + '</dl>' +
      (ephemeral ? '<p class="muted" style="margin:14px 0 0">Test game. Nothing was recorded.</p>' : '');
    show(overOverlay);
  }
  $('#over-new').addEventListener('click', () => newGame());
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

  function pct(x) { return x === null || x === undefined ? '—' : Math.round(x * 100) + '%'; }

  // Two bars on a 0..100% scale: what you chose vs what random picking predicts.
  function shareRow(label, chosen, expected, n, title) {
    return `<div class="attr-group" title="${title || ''}"><span class="l">${label}</span><div class="pair">` +
      `<div class="row">${bar(chosen, 1, 'series-1')}<span class="v">${pct(chosen)} <small>chosen</small></span></div>` +
      `<div class="row">${bar(expected, 1, 'neutral')}<span class="v">${pct(expected)} <small>expected · ${n}</small></span></div>` +
      `</div></div>`;
  }

  // Verdict for a chosen-vs-expected share with n trials: two standard errors.
  function lean(chosen, expected, n, favLabel, disLabel) {
    if (!n || chosen === null) return '<span class="tag">no data</span>';
    const se = Math.sqrt(Math.max(expected * (1 - expected), 0.01) / n);
    const d = chosen - expected;
    if (n < 8 || Math.abs(d) < 2 * se) return '<span class="tag">no clear lean</span>';
    return `<span class="tag ${d > 0 ? 'fav' : 'dis'}">${d > 0 ? favLabel : disLabel}</span>`;
  }

  function renderStats() {
    const sets = stats.allSets();
    const games = stats.finishedGames();
    const body = $('#stats-body');
    if (!sets.length) {
      body.innerHTML = '<p class="empty">No sets recorded yet. Go find some.</p>';
      return;
    }
    const withAvail = StatsLib.withAvailability(sets);
    const choices = withAvail.filter((s) => s.availableKinds.length > 1).length;
    const allTimes = sets.map((s) => s.ms);

    let html = '<div class="tiles">' +
      `<div class="tile"><span class="v">${games.length}</span><span class="l">games finished</span></div>` +
      `<div class="tile"><span class="v">${sets.length}</span><span class="l">sets found</span></div>` +
      `<div class="tile"><span class="v">${fmtMs(StatsLib.median(allTimes))}</span><span class="l">median time per set</span></div>` +
      `<div class="tile"><span class="v">${choices}</span><span class="l">finds with a choice of sets</span></div>` +
      '</div>';

    // 1. Preference by attribute
    const byAttr = StatsLib.biasByAttribute(sets);
    html += '<div class="section"><h3>What you reach for</h3>' +
      '<p class="hint">Only finds where both a “same” and a “different” set were on the table count. “Chosen” is how often you took the set where that attribute was the same. “Expected” is how often you would have if you picked among the available sets at random.</p>' +
      '<div class="legend"><span><i style="background:var(--series-1)"></i>Chosen</span><span><i style="background:var(--neutral)"></i>Expected at random</span></div>' +
      byAttr.map((a) =>
        shareRow(`Same ${a.label.toLowerCase()} ${lean(a.chosenSame, a.expectedSame, a.n, 'you favour these', 'you overlook these')}`, a.chosenSame, a.expectedSame, a.n,
          `${a.label} same: chosen ${pct(a.chosenSame)}, expected ${pct(a.expectedSame)}, over ${a.n} finds with both options`)
      ).join('') + '</div>';

    // 2. By number of differing attributes
    const byN = StatsLib.biasByNumDiffering(sets);
    html += '<div class="section"><h3>By how many attributes differ</h3>' +
      '<p class="hint">Share of your finds by how many attributes vary within the set, against the share on offer. One differing attribute means three otherwise identical cards; four means everything differs.</p>' +
      byN.map((b) =>
        shareRow(`${b.differing} differ${b.differing === 1 ? 's' : ''} ${lean(b.chosen, b.expected, b.n, 'you favour these', 'you overlook these')}`, b.chosen, b.expected, b.n,
          `${b.differing} differing: chosen ${pct(b.chosen)}, expected ${pct(b.expected)}, over ${b.n} finds`)
      ).join('') + '</div>';

    // 3. Speed when there was no choice
    const solo = StatsLib.soloSets(sets);
    const soloAttr = StatsLib.byAttributeSameVsDiff(solo);
    const maxSolo = Math.max(1, ...soloAttr.flatMap((a) => [a.same.median || 0, a.diff.median || 0]));
    html += '<div class="section"><h3>Speed when there was only one set</h3>' +
      `<p class="hint">Median time to find a set when it was the only one on the table (${solo.length} of ${sets.length} finds), so the time reflects the set itself rather than which one you chose.</p>` +
      '<div class="legend"><span><i style="background:var(--series-1)"></i>Same</span><span><i style="background:var(--series-2)"></i>Different</span></div>' +
      soloAttr.map((a) =>
        `<div class="attr-group"><span class="l">${a.label}</span><div class="pair">` +
        `<div class="row">${bar(a.same.median, maxSolo, 'series-1')}<span class="v">${val(a.same)}</span></div>` +
        `<div class="row">${bar(a.diff.median, maxSolo, 'series-2')}<span class="v">${val(a.diff)}</span></div>` +
        `</div></div>`
      ).join('');
    const soloN = StatsLib.byNumDiffering(solo);
    const maxSoloN = Math.max(1, ...soloN.map((b) => b.median || 0));
    html += '<div class="hbars" style="margin-top:12px">' + soloN.map((b) =>
      `<div class="hbar"><span class="l">${b.differing} differ${b.differing === 1 ? 's' : ''}</span>${bar(b.median, maxSoloN, 'series-1')}<span class="v">${val(b)}</span></div>`
    ).join('') + '</div></div>';

    // 4. All fifteen kinds
    const kinds = StatsLib.biasByKind(sets).slice().sort((a, b) => (b.ratio === null ? -1 : b.ratio) - (a.ratio === null ? -1 : a.ratio));
    html += '<div class="section"><h3>All fifteen kinds</h3>' +
      '<p class="hint">“Expected” is how many times random picking would have chosen this kind given how often it was on the table. A ratio above 1 means you gravitate to it; below 1 you tend to pass it over. Kinds expected fewer than three times are greyed out.</p>' +
      '<div class="table-wrap"><table class="table">' +
      '<thead><tr><th>Kind</th><th class="num">Differ</th><th class="num">On table</th><th class="num">Chosen</th><th class="num">Expected</th><th class="num">Ratio</th></tr></thead><tbody>' +
      kinds.map((k) =>
        `<tr class="${k.expected < 3 ? 'dim' : ''}"><td>${k.label}</td><td class="num">${k.numDiffering}</td><td class="num">${k.timesAvailable}</td><td class="num">${k.chosen}</td><td class="num">${k.expected.toFixed(1)}</td><td class="num">${k.ratio === null ? '—' : k.ratio.toFixed(2)}</td></tr>`
      ).join('') + '</tbody></table></div></div>';

    // 5. Game history
    html += '<div class="section"><h3>Games</h3>';
    if (!games.length) {
      html += '<p class="hint">No finished games yet. Play a deck to the end to see it here.</p>';
    } else {
      const sums = games.map(StatsLib.gameSummary);
      if (sums.length >= 2) html += sparkline(sums.map((s) => s.medianMs || 0));
      html += '<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th class="num">Sets</th><th class="num">Time</th><th class="num">Median</th><th class="num">Wrong</th><th class="num">False calls</th><th>Last card</th></tr></thead><tbody>' +
        sums.slice().reverse().slice(0, 40).map((s, i) => {
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
    attachRecord();
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
    const k = e.key.toLowerCase();
    // Testing shortcut: Ctrl+Shift+E jumps to the last 12 cards of a deck in a
    // game whose stats are not recorded.
    if (e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && k === 'e') {
      e.preventDefault();
      newGame({ endgame: true });
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!pauseOverlay.hidden) {
      if (k === 'p' || k === 'escape' || k === ' ' || k === 'enter') { e.preventDefault(); setPaused(false); }
      return;
    }
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
    if (k === 'p') { setPaused(true); return; }
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

  // Pause the instant the game loses focus (switching apps or windows, the
  // app switcher, a phone call) so the blurred screen is what gets snapshotted,
  // not something the player sees appear after coming back.
  function onFocusLost() {
    if (!game || game.over || anyOverlayOpen()) return;
    setPaused(true);
  }
  window.addEventListener('blur', onFocusLost);
  window.addEventListener('pagehide', onFocusLost);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { onFocusLost(); clock.pause('hidden'); }
    else clock.resume('hidden');
  });
  window.addEventListener('resize', fit);
  if (window.screen && window.screen.orientation) window.screen.orientation.addEventListener('change', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(board);

  // ---- go -------------------------------------------------------------------------
  newGame();

  // Offline support / installability. Service workers need http(s); when the
  // page is opened from disk this is simply skipped.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => { document.documentElement.dataset.sw = 'registered'; reg.update(); })
      .catch(() => { document.documentElement.dataset.sw = 'failed'; });
    navigator.serviceWorker.ready.then(() => { document.documentElement.dataset.sw = 'ready'; });
  }

  // Debug hooks for the console and tests. dealExtra() deals three cards
  // regardless of whether a set is on the table (for layout checks).
  function dealExtra() {
    if (!game || game.over || game.deck.length < 3) return;
    const dealt = [];
    for (let i = 0; i < 3; i++) { game.board.push(game._dealOne()); dealt.push(game.board.length - 1); }
    dealt.forEach((p) => { const el = cardEl(p); el.classList.add('dealt'); board.appendChild(el); });
    fit(); updateStatus(); clock.mark();
  }
  window.webset = { get game() { return game; }, stats, clock, newGame, fit, dealExtra, endgame: () => newGame({ endgame: true }) };
})();
