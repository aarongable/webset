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
    // Squiggle: traced from a photograph of a real card (tools/trace_squiggle.html),
    // then symmetrized and fitted to the box by tools/squiggle.py.
    squiggle: 'M12.7 29.7 C12.7 25.9 13.5 21.7 15.3 18.5 C17.1 15.4 20.4 12.5 23.6 10.7 C26.9 9.0 31.0 8.3 34.9 8.0 C38.7 7.7 42.7 8.1 46.5 8.8 C50.2 9.5 54.0 10.6 57.6 12.1 C61.2 13.5 64.7 15.4 67.9 17.5 C71.0 19.7 74.1 22.2 76.7 25.0 C79.4 27.8 81.8 31.0 83.7 34.4 C85.6 37.7 87.0 41.4 88.1 45.1 C89.2 48.8 89.8 52.7 90.1 56.6 C90.5 60.4 90.4 64.4 90.1 68.2 C89.8 72.1 89.2 75.9 88.4 79.7 C87.7 83.5 86.6 87.3 85.5 91.0 C84.4 94.8 83.1 98.4 82.0 102.2 C80.9 105.9 79.8 109.6 79.1 113.4 C78.3 117.2 77.7 121.1 77.6 125.0 C77.4 128.9 77.7 132.8 78.2 136.6 C78.8 140.4 79.9 144.2 81.0 147.9 C82.1 151.6 83.7 155.2 84.8 158.9 C85.8 162.7 87.3 166.6 87.3 170.3 C87.3 174.1 86.5 178.3 84.7 181.5 C82.9 184.6 79.6 187.5 76.4 189.3 C73.1 191.0 69.0 191.7 65.1 192.0 C61.3 192.3 57.3 191.9 53.5 191.2 C49.8 190.5 46.0 189.4 42.4 187.9 C38.8 186.5 35.3 184.6 32.1 182.5 C29.0 180.3 25.9 177.8 23.3 175.0 C20.6 172.2 18.2 169.0 16.3 165.6 C14.4 162.3 13.0 158.6 11.9 154.9 C10.8 151.2 10.2 147.3 9.9 143.4 C9.5 139.6 9.6 135.6 9.9 131.8 C10.2 127.9 10.8 124.1 11.6 120.3 C12.3 116.5 13.4 112.7 14.5 109.0 C15.6 105.2 16.9 101.6 18.0 97.8 C19.1 94.1 20.2 90.4 20.9 86.6 C21.7 82.8 22.3 78.9 22.4 75.0 C22.6 71.1 22.3 67.2 21.8 63.4 C21.2 59.6 20.1 55.8 19.0 52.1 C17.9 48.4 16.3 44.8 15.2 41.1 C14.2 37.3 12.7 33.4 12.7 29.7 Z',
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
