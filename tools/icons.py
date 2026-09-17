#!/usr/bin/env python3
"""Regenerate icons/icon.svg and icons/icon-maskable.svg from the current
squiggle path in js/cards.js, then rasterize them with headless Chrome:

    python3 tools/icons.py
    for s in 512:icon-512 192:icon-192 180:apple-touch-icon; do ...; done  (see README)
"""
import re
sq = re.search(r"squiggle: '([^']*)'", open('js/cards.js').read()).group(1)
def svg(scale, gap):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#f4f2ec"/>
  <g transform="translate(256 256)">
    <g transform="translate({-gap} 0) scale({scale}) translate(-50 -100)"><path d="M50 3 L97.1 100 L50 197 L2.9 100 Z" fill="#EE1C2E"/></g>
    <g transform="scale({scale}) translate(-50 -100)"><path d="M50 8 A45.1 45.1 0 0 1 95.1 53.1 V146.9 A45.1 45.1 0 0 1 4.9 146.9 V53.1 A45.1 45.1 0 0 1 50 8 Z" fill="#05A86A"/></g>
    <g transform="translate({gap} 0) scale({scale}) translate(-50 -100)"><path d="{sq}" fill="#8B3FA6"/></g>
  </g>
</svg>
'''
open('icons/icon.svg', 'w').write(svg(1.05, 155))
open('icons/icon-maskable.svg', 'w').write(svg(0.78, 118))
