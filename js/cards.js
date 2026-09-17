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
  // Symbols are drawn in a 100 x 200 box and scaled to 70 x 140.

  const CARD_W = 350, CARD_H = 225;
  const SYM_SCALE = 0.7;
  const SYM_W = 100 * SYM_SCALE, SYM_H = 200 * SYM_SCALE;
  const CENTERS = [[175], [130, 220], [85, 175, 265]];

  const SHAPE_PATHS = {
    oval: 'M50 8 H50 A42 42 0 0 1 92 50 V150 A42 42 0 0 1 8 150 V50 A42 42 0 0 1 50 8 Z',
    diamond: 'M50 6 L94 100 L50 194 L6 100 Z',
    // Squiggle: a tilted S-shaped tube with round caps. Generated from a sine
    // centerline (see tools/squiggle.py) and then embedded here.
    squiggle: 'M70.7 21.3 C73.5 25.4 75.9 30.4 78.9 36.2 C81.9 42.0 86.7 48.5 88.7 56.1 C90.6 63.7 91.6 73.6 90.5 81.7 C89.3 89.7 85.2 97.9 81.8 104.4 C78.3 110.8 72.8 115.6 69.8 120.6 C66.8 125.6 65.0 130.7 63.7 134.2 C62.5 137.6 62.4 139.4 62.2 141.3 C61.9 143.1 61.7 143.1 62.1 145.4 C62.6 147.8 63.8 151.6 64.7 155.3 C65.6 159.1 67.7 163.8 67.6 168.0 C67.4 172.1 65.9 176.8 63.7 180.3 C61.5 183.9 57.9 187.2 54.2 189.1 C50.5 191.1 45.7 192.2 41.6 192.0 C37.4 191.8 32.7 190.4 29.2 188.2 C25.7 186.0 23.5 183.6 20.4 178.7 C17.3 173.8 12.6 166.4 10.7 158.8 C8.7 151.2 7.7 141.2 8.9 133.2 C10.0 125.1 14.1 117.0 17.6 110.5 C21.0 104.0 26.6 99.3 29.6 94.3 C32.6 89.3 34.4 84.2 35.6 80.7 C36.9 77.3 36.9 75.5 37.1 73.7 C37.4 71.8 37.6 71.8 37.2 69.5 C36.8 67.1 36.4 63.7 34.6 59.6 C32.8 55.4 28.3 49.3 26.4 44.7 C24.6 40.1 23.4 36.2 23.5 32.1 C23.7 27.9 25.1 23.2 27.4 19.7 C29.6 16.2 33.2 12.8 36.8 10.9 C40.5 8.9 45.3 7.8 49.5 8.0 C53.6 8.1 58.3 9.6 61.9 11.8 C65.4 14.0 67.8 17.2 70.7 21.3 Z',
  };

  function stripePatternId(colorIdx) {
    return 'stripes-' + VALUES.color[colorIdx];
  }

  // Defs shared by all cards on a page. Include once (inside any <svg>).
  function stripeDefsSVG() {
    return VALUES.color.map((c) =>
      `<pattern id="stripes-${c}" patternUnits="userSpaceOnUse" width="100" height="10" style="color:var(--set-${c})">` +
      `<line x1="0" y1="5" x2="100" y2="5" stroke="currentColor" stroke-width="2.6"/>` +
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
    return `<g transform="translate(${tx} ${ty}) scale(${SYM_SCALE})" style="color:var(--set-${color})">` +
      `<path d="${SHAPE_PATHS[VALUES.shape[shapeIdx]]}" fill="${fill}" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/>` +
      `</g>`;
  }

  function cardFaceSVG(id) {
    const [color, number, shape, fill] = attrs(id);
    const syms = CENTERS[number].map((cx) => symbolSVG(shape, fill, color, cx)).join('');
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
      body += `<path transform="translate(${i * gap} 0)" d="${SHAPE_PATHS[shapeName]}" fill="${f}" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/>`;
    }
    return `<svg viewBox="0 0 ${width} 200" style="${style}" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  const api = {
    ATTRS, VALUES, ATTR_LABELS,
    attrs, fromAttrs, isSet, thirdCard, findSets, kind, numDiffering, kindLabel, describe,
    CARD_W, CARD_H, renderCardSVG, renderSymbolIconSVG, stripeDefsSVG,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Cards = api;
})(typeof window !== 'undefined' ? window : globalThis);
