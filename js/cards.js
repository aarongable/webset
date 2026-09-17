// Card model and SVG rendering for the game of Set.
//
// A card is an integer 0..80. Its four attributes are the base-3 digits of
// that integer, most significant first: color, number, shape, fill.
// Each attribute takes a value 0, 1 or 2.

(function (root) {
  'use strict';

  const ATTRS = ['color', 'number', 'shape', 'fill'];
  const VALUES = {
    color: ['red', 'green', 'purple'],
    number: ['one', 'two', 'three'],
    shape: ['oval', 'diamond', 'squiggle'],
    fill: ['solid', 'striped', 'open'],
  };
  const ATTR_LABELS = { color: 'Color', number: 'Number', shape: 'Shape', fill: 'Fill' };

  function attrs(id) {
    return [
      Math.floor(id / 27) % 3,
      Math.floor(id / 9) % 3,
      Math.floor(id / 3) % 3,
      id % 3,
    ];
  }

  function fromAttrs(a) {
    return a[0] * 27 + a[1] * 9 + a[2] * 3 + a[3];
  }

  function isSet(a, b, c) {
    const A = attrs(a), B = attrs(b), C = attrs(c);
    for (let i = 0; i < 4; i++) {
      if ((A[i] + B[i] + C[i]) % 3 !== 0) return false;
    }
    return true;
  }

  // The unique card completing a set with a and b.
  function thirdCard(a, b) {
    const A = attrs(a), B = attrs(b);
    const C = [];
    for (let i = 0; i < 4; i++) C.push((6 - A[i] - B[i]) % 3);
    return fromAttrs(C);
  }

  // All sets among an array of card ids. Returns triples of *indices* into
  // the array, each sorted ascending.
  function findSets(ids) {
    const index = new Map();
    ids.forEach((id, i) => { if (id !== null && id !== undefined) index.set(id, i); });
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] === null || ids[i] === undefined) continue;
      for (let j = i + 1; j < ids.length; j++) {
        if (ids[j] === null || ids[j] === undefined) continue;
        const k = index.get(thirdCard(ids[i], ids[j]));
        if (k !== undefined && k > j) out.push([i, j, k]);
      }
    }
    return out;
  }

  // Signature of a set: 4-bit mask, bit i set when attribute i differs
  // across the three cards. Bit order matches ATTRS (color = bit 0).
  function kind(a, b, c) {
    const A = attrs(a), B = attrs(b);
    let sig = 0;
    for (let i = 0; i < 4; i++) if (A[i] !== B[i]) sig |= 1 << i;
    return sig;
  }

  function numDiffering(sig) {
    let n = 0;
    for (let i = 0; i < 4; i++) if (sig & (1 << i)) n++;
    return n;
  }

  function kindLabel(sig) {
    const same = [], diff = [];
    ATTRS.forEach((a, i) => ((sig & (1 << i)) ? diff : same).push(ATTR_LABELS[a]));
    if (same.length === 0) return 'All different';
    return 'Same ' + same.join(', ').toLowerCase();
  }

  function describe(id) {
    const a = attrs(id);
    const n = VALUES.number[a[1]];
    const shape = VALUES.shape[a[2]] + (a[1] === 0 ? '' : 's');
    return `${n} ${VALUES.fill[a[3]]} ${VALUES.color[a[0]]} ${shape}`;
  }

  // ---------------------------------------------------------------------
  // Rendering
  //
  // Card viewBox is 350 x 225 (3.5in x 2.25in at 100 units/inch).
  //
  // Symbols are drawn in a 100 x 200 box as their OUTER boundary, then scaled
  // by SYM_SCALE onto the card. The outline stroke is clipped to the inside of
  // the shape so it never enlarges the symbol. Every number below was measured
  // from photographs of real cards (an older printing with narrower symbols,
  // matching the 1998 deck), as fractions of the card's short side:
  //
  //             long   short  centre pitch
  //   oval      0.689  0.317  0.440      (a stadium)
  //   diamond   0.720  0.335  0.445      (sharp rhombus)
  //   squiggle  0.666  0.300  0.417      (traced outline)
  //   outline stroke 0.020, stripe pitch 0.0195, stripe line 0.0078
  //
  // The box is scaled so the oval's length of 184 box units becomes 0.689 of 225.

  const CARD_W = 350, CARD_H = 225;
  const SYM_SCALE = 0.8424;
  const SYM_W = 100 * SYM_SCALE, SYM_H = 200 * SYM_SCALE;
  const PITCH = { oval: 99, diamond: 100, squiggle: 94 }; // card units, centre to centre
  const STROKE = 5.34;  // visible stroke in box units (drawn doubled, clipped to the inside)

  // Stripe geometry in box units.
  const STRIPE_PITCH = 5.2, STRIPE_WIDTH = 2.1;

  const SHAPE_PATHS = {
    oval: 'M50 8 A42.35 42.35 0 0 1 92.35 50.35 V149.65 A42.35 42.35 0 0 1 7.65 149.65 V50.35 A42.35 42.35 0 0 1 50 8 Z',
    diamond: 'M50 3.85 L94.75 100 L50 196.15 L5.25 100 Z',
    // Squiggle: traced from a photograph of a real card (tools/trace_squiggle.html,
    // tools/squiggle_trace.json), symmetrized and fitted by tools/squiggle.py.
    squiggle: 'M30.9 11.3 C34.6 10.8 38.6 11.0 42.3 11.4 C46.1 11.9 49.9 12.8 53.5 14.1 C57.1 15.3 60.6 16.9 63.9 18.9 C67.2 20.8 70.3 23.2 73.0 25.8 C75.8 28.4 78.3 31.4 80.3 34.6 C82.3 37.8 84.0 41.4 85.2 45.0 C86.3 48.6 87.0 52.4 87.4 56.2 C87.8 60.0 87.8 63.9 87.7 67.7 C87.5 71.5 87.0 75.3 86.3 79.1 C85.6 82.8 84.6 86.5 83.5 90.2 C82.4 93.9 81.0 97.4 79.8 101.0 C78.6 104.7 77.1 108.3 76.3 112.0 C75.4 115.7 74.8 119.5 74.7 123.3 C74.6 127.1 75.0 131.0 75.8 134.7 C76.5 138.4 77.8 142.1 79.2 145.7 C80.6 149.2 82.6 152.5 84.2 156.0 C85.8 159.5 88.1 162.9 88.7 166.5 C89.4 170.1 89.6 174.5 88.2 177.7 C86.7 180.9 83.2 183.7 80.1 185.5 C76.9 187.3 72.8 188.2 69.1 188.7 C65.4 189.2 61.4 189.0 57.7 188.6 C53.9 188.1 50.1 187.2 46.5 185.9 C42.9 184.7 39.4 183.1 36.1 181.1 C32.8 179.2 29.7 176.8 27.0 174.2 C24.2 171.6 21.7 168.6 19.7 165.4 C17.7 162.2 16.0 158.6 14.8 155.0 C13.7 151.4 13.0 147.6 12.6 143.8 C12.2 140.0 12.2 136.1 12.3 132.3 C12.5 128.5 13.0 124.7 13.7 120.9 C14.4 117.2 15.4 113.5 16.5 109.8 C17.6 106.1 19.0 102.6 20.2 99.0 C21.4 95.3 22.9 91.7 23.7 88.0 C24.6 84.3 25.2 80.5 25.3 76.7 C25.4 72.9 25.0 69.0 24.2 65.3 C23.5 61.6 22.2 57.9 20.8 54.3 C19.4 50.8 17.4 47.5 15.8 44.0 C14.2 40.5 11.9 37.1 11.3 33.5 C10.6 29.9 10.4 25.5 11.8 22.3 C13.3 19.1 16.8 16.3 19.9 14.5 C23.1 12.7 27.2 11.8 30.9 11.3 Z',
  };

  function centers(shapeIdx, number) {
    const p = PITCH[VALUES.shape[shapeIdx]];
    return [[175], [175 - p / 2, 175 + p / 2], [175 - p, 175, 175 + p]][number];
  }

  function stripePatternId(colorIdx) {
    return 'stripes-' + VALUES.color[colorIdx];
  }

  // Defs shared by all cards on a page. Include once (inside any <svg>):
  // stripe patterns per colour and a clip path per shape (used to keep the
  // outline stroke inside the symbol).
  function stripeDefsSVG() {
    return VALUES.shape.map((sh) => `<clipPath id="clip-${sh}"><path d="${SHAPE_PATHS[sh]}"/></clipPath>`).join('') +
      VALUES.color.map((c) =>
      `<pattern id="stripes-${c}" patternUnits="userSpaceOnUse" width="100" height="${STRIPE_PITCH}" style="color:var(--set-${c})">` +
      `<line x1="0" y1="${STRIPE_PITCH / 2}" x2="100" y2="${STRIPE_PITCH / 2}" stroke="currentColor" stroke-width="${STRIPE_WIDTH}"/>` +
      `</pattern>`
    ).join('');
  }

  function symbolSVG(shapeIdx, fillIdx, colorIdx, cx) {
    const color = VALUES.color[colorIdx];
    let fill;
    if (fillIdx === 0) fill = 'currentColor';
    else if (fillIdx === 1) fill = `url(#${stripePatternId(colorIdx)})`;
    else fill = 'none';
    const tx = cx - SYM_W / 2, ty = (CARD_H - SYM_H) / 2;
    const shape = VALUES.shape[shapeIdx];
    return `<g transform="translate(${tx} ${ty}) scale(${SYM_SCALE})" style="color:var(--set-${color})">` +
      `<path d="${SHAPE_PATHS[shape]}" fill="${fill}" stroke="currentColor" stroke-width="${STROKE * 2}" stroke-linejoin="miter" clip-path="url(#clip-${shape})"/>` +
      `</g>`;
  }

  function cardFaceSVG(id) {
    const [color, number, shape, fill] = attrs(id);
    const syms = centers(shape, number).map((cx) => symbolSVG(shape, fill, color, cx)).join('');
    return `<rect class="card-face" x="1.5" y="1.5" width="${CARD_W - 3}" height="${CARD_H - 3}" rx="18"/>` + syms;
  }

  function cardBackSVG() {
    return `<rect class="card-back" x="1.5" y="1.5" width="${CARD_W - 3}" height="${CARD_H - 3}" rx="18"/>` +
      `<rect class="card-back-inner" x="16" y="16" width="${CARD_W - 32}" height="${CARD_H - 32}" rx="10" fill="none" stroke-width="2"/>` +
      `<text class="card-back-glyph" x="175" y="140" text-anchor="middle" font-size="84" font-family="Georgia, serif">?</text>`;
  }

  function renderCardSVG(id, opts) {
    opts = opts || {};
    const inner = opts.faceDown ? cardBackSVG() : cardFaceSVG(id);
    return `<svg viewBox="0 0 ${CARD_W} ${CARD_H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${inner}</svg>`;
  }

  // Small standalone symbol icon (used in the last-card guess picker).
  // Any attribute may be null to mean "neutral gray".
  function renderSymbolIconSVG({ color, shape, fill, number }) {
    const c = color === null || color === undefined ? null : VALUES.color[color];
    const style = c ? `color:var(--set-${c})` : 'color:var(--icon-neutral)';
    const shapeName = VALUES.shape[shape === null || shape === undefined ? 0 : shape];
    let f;
    if (fill === 1) f = c ? `url(#${stripePatternId(color)})` : 'url(#stripes-neutral)';
    else if (fill === 2) f = 'none';
    else f = 'currentColor';
    const n = number === null || number === undefined ? 1 : number + 1;
    const gap = 110;
    const width = 100 + (n - 1) * gap;
    let body = '';
    for (let i = 0; i < n; i++) {
      body += `<path transform="translate(${i * gap} 0)" d="${SHAPE_PATHS[shapeName]}" fill="${f}" stroke="currentColor" stroke-width="${STROKE * 2}" stroke-linejoin="miter" clip-path="url(#clip-${shapeName})"/>`;
    }
    return `<svg viewBox="0 0 ${width} 200" style="${style}" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  const api = {
    ATTRS, VALUES, ATTR_LABELS,
    attrs, fromAttrs, isSet, thirdCard, findSets, kind, numDiffering, kindLabel, describe,
    CARD_W, CARD_H, STRIPE_PITCH, STRIPE_WIDTH, renderCardSVG, renderSymbolIconSVG, stripeDefsSVG,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Cards = api;
})(typeof window !== 'undefined' ? window : globalThis);
