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
  // Symbols are drawn in a 100 x 200 box. Proportions were measured from a
  // photograph of real cards (see tools/squiggle.py for the numbers): the oval
  // is a 2:1 stadium spanning 0.686 of the card's short side, the diamond is a
  // sharp rhombus of the same width and slightly longer, the squiggle is
  // shorter and narrower. The box is scaled so oval length 184 -> 154.4 units.

  const CARD_W = 350, CARD_H = 225;
  const SYM_SCALE = 0.839;
  const SYM_W = 100 * SYM_SCALE, SYM_H = 200 * SYM_SCALE;
  const PITCH = 100.4; // centre-to-centre distance between symbols
  const CENTERS = [[175], [175 - PITCH / 2, 175 + PITCH / 2], [175 - PITCH, 175, 175 + PITCH]];
  const STROKE = 6.7;   // 5.6 card units, 2.5% of the card's short side

  // Stripe geometry in symbol units: measured pitch is 1.94% of the card's
  // short side (4.36 card units); real lines are thinner than this but need a
  // little extra weight to survive small screens.
  const STRIPE_PITCH = 5.2, STRIPE_WIDTH = 1.8;

  const SHAPE_PATHS = {
    oval: 'M50 8 A46 46 0 0 1 96 54 V146 A46 46 0 0 1 4 146 V54 A46 46 0 0 1 50 8 Z',
    diamond: 'M50 5.5 L96 100 L50 194.5 L4 100 Z',
    // Squiggle: traced from a photograph of a real card (tools/trace_squiggle.html),
    // then symmetrized and fitted to the box by tools/squiggle.py.
    squiggle: 'M16.4 36.6 C16.4 33.2 17.1 29.4 18.7 26.5 C20.3 23.7 23.3 21.0 26.2 19.5 C29.1 17.9 32.9 17.3 36.3 17.0 C39.8 16.7 43.4 17.1 46.8 17.7 C50.2 18.3 53.6 19.3 56.9 20.7 C60.1 22.0 63.2 23.6 66.1 25.6 C69.0 27.6 71.7 29.8 74.1 32.4 C76.5 34.9 78.7 37.8 80.4 40.8 C82.1 43.8 83.4 47.2 84.4 50.5 C85.3 53.8 85.9 57.4 86.2 60.8 C86.5 64.3 86.5 67.8 86.2 71.3 C85.9 74.8 85.4 78.3 84.7 81.7 C84.0 85.2 83.0 88.5 82.0 91.9 C81.1 95.3 79.9 98.6 78.9 101.9 C77.9 105.3 76.9 108.7 76.2 112.1 C75.6 115.6 75.0 119.1 74.9 122.5 C74.8 126.0 75.0 129.6 75.5 133.0 C76.0 136.5 77.0 139.8 78.0 143.2 C79.0 146.6 80.4 149.8 81.4 153.2 C82.3 156.6 83.6 160.1 83.6 163.4 C83.6 166.8 82.9 170.6 81.3 173.5 C79.7 176.3 76.7 179.0 73.8 180.5 C70.9 182.1 67.1 182.7 63.7 183.0 C60.2 183.3 56.6 182.9 53.2 182.3 C49.8 181.7 46.4 180.7 43.1 179.3 C39.9 178.0 36.8 176.4 33.9 174.4 C31.0 172.4 28.3 170.2 25.9 167.6 C23.5 165.1 21.3 162.2 19.6 159.2 C17.9 156.2 16.6 152.8 15.6 149.5 C14.7 146.2 14.1 142.6 13.8 139.2 C13.5 135.7 13.5 132.2 13.8 128.7 C14.1 125.2 14.6 121.7 15.3 118.3 C16.0 114.8 17.0 111.5 18.0 108.1 C18.9 104.7 20.1 101.4 21.1 98.1 C22.1 94.7 23.1 91.3 23.8 87.9 C24.4 84.4 25.0 80.9 25.1 77.5 C25.2 74.0 25.0 70.4 24.5 67.0 C24.0 63.5 23.0 60.2 22.0 56.8 C21.0 53.4 19.6 50.2 18.6 46.8 C17.7 43.4 16.4 39.9 16.4 36.6 Z',
  };

  function stripePatternId(colorIdx) {
    return 'stripes-' + VALUES.color[colorIdx];
  }

  // Defs shared by all cards on a page. Include once (inside any <svg>).
  function stripeDefsSVG() {
    return VALUES.color.map((c) =>
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
    return `<g transform="translate(${tx} ${ty}) scale(${SYM_SCALE})" style="color:var(--set-${color})">` +
      `<path d="${SHAPE_PATHS[VALUES.shape[shapeIdx]]}" fill="${fill}" stroke="currentColor" stroke-width="${STROKE}" stroke-linejoin="round"/>` +
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
      body += `<path transform="translate(${i * gap} 0)" d="${SHAPE_PATHS[shapeName]}" fill="${f}" stroke="currentColor" stroke-width="${STROKE}" stroke-linejoin="round"/>`;
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
