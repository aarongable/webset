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
  // from a photograph of the owner's 1998 deck (tools/measure_card.html), as
  // fractions of the card's short side:
  //
  //             long   short  centre pitch
  //   oval      0.678  0.332  0.456      (a stadium, 2.04:1)
  //   diamond   0.715  0.347  0.448      (sharp rhombus, 2.06:1)
  //   squiggle  0.650  0.314  0.410      (traced outline)
  //   outline stroke 0.018, stripe pitch 0.0193, stripe line 0.0055
  //
  // The box is scaled so the oval's length of 184 box units becomes 0.678 of 225.

  const CARD_W = 350, CARD_H = 225;
  const SYM_SCALE = 0.829;
  const SYM_W = 100 * SYM_SCALE, SYM_H = 200 * SYM_SCALE;
  const PITCH = { oval: 102.6, diamond: 100.8, squiggle: 92.3 }; // card units, centre to centre
  const STROKE = 4.9;   // visible stroke in box units (drawn doubled, clipped to the inside)

  // Stripe geometry in box units (the line is drawn a touch heavier than the
  // measured 1.5 so it survives small screens).
  const STRIPE_PITCH = 5.24, STRIPE_WIDTH = 1.7;

  const SHAPE_PATHS = {
    oval: 'M50 8 A45.1 45.1 0 0 1 95.1 53.1 V146.9 A45.1 45.1 0 0 1 4.9 146.9 V53.1 A45.1 45.1 0 0 1 50 8 Z',
    diamond: 'M50 3 L97.1 100 L50 197 L2.9 100 Z',
    // Squiggle: traced from a photograph of the owner's card (tools/trace_squiggle.html,
    // tools/squiggle_trace.json), symmetrized and fitted by tools/squiggle.py.
    squiggle: 'M36.4 12.0 C40.2 11.9 44.1 12.2 47.8 12.9 C51.6 13.6 55.3 14.7 58.9 16.1 C62.4 17.6 65.9 19.3 69.0 21.5 C72.2 23.6 75.2 26.2 77.7 29.0 C80.3 31.8 82.6 35.0 84.3 38.4 C86.0 41.7 87.3 45.5 88.2 49.2 C89.0 52.9 89.4 56.8 89.6 60.6 C89.7 64.4 89.5 68.3 89.1 72.1 C88.6 75.9 87.9 79.7 86.9 83.4 C86.0 87.1 84.8 90.8 83.6 94.4 C82.3 98.0 80.7 101.5 79.5 105.2 C78.4 108.8 77.1 112.5 76.5 116.3 C75.9 120.0 75.7 123.9 76.0 127.7 C76.3 131.5 77.2 135.3 78.3 139.0 C79.5 142.6 81.2 146.1 82.9 149.5 C84.5 153.0 86.9 156.2 88.1 159.8 C89.4 163.3 90.8 167.4 90.3 170.9 C89.7 174.4 87.6 178.3 85.0 180.8 C82.5 183.4 78.5 185.0 75.0 186.2 C71.4 187.4 67.4 187.9 63.6 188.0 C59.8 188.1 55.9 187.8 52.2 187.1 C48.4 186.4 44.7 185.3 41.1 183.9 C37.6 182.4 34.1 180.7 31.0 178.5 C27.8 176.4 24.8 173.8 22.3 171.0 C19.7 168.2 17.4 165.0 15.7 161.6 C14.0 158.3 12.7 154.5 11.8 150.8 C11.0 147.1 10.6 143.2 10.4 139.4 C10.3 135.6 10.5 131.7 10.9 127.9 C11.4 124.1 12.1 120.3 13.1 116.6 C14.0 112.9 15.2 109.2 16.4 105.6 C17.7 102.0 19.3 98.5 20.5 94.8 C21.6 91.2 22.9 87.5 23.5 83.7 C24.1 80.0 24.3 76.1 24.0 72.3 C23.7 68.5 22.8 64.7 21.7 61.0 C20.5 57.4 18.8 53.9 17.1 50.5 C15.5 47.0 13.1 43.8 11.9 40.2 C10.6 36.7 9.2 32.6 9.7 29.1 C10.3 25.6 12.4 21.7 15.0 19.2 C17.5 16.6 21.5 15.0 25.0 13.8 C28.6 12.6 32.6 12.1 36.4 12.0 Z',
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
