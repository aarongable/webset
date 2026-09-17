#!/usr/bin/env python3
"""Turn a traced squiggle outline into the SVG path used in js/cards.js.

The outline comes from tools/trace_squiggle.html, which crops the single red
squiggle out of a photograph of real cards, thresholds the red pixels and
walks the boundary. Run it in a browser (or headless Chrome with --dump-dom)
and save the JSON it prints as trace.json, then:

    python3 tools/squiggle.py trace.json

The shape is rotated to the tall orientation used on a landscape card, made
exactly point-symmetric (the real symbol is; the photo has a little camera
skew), scaled so its long axis matches the oval's, and written as a closed
Catmull-Rom spline of cubic Beziers in a 100x200 box.
"""
import json
import math
import sys

LONG_AXIS = 184.0          # same as the oval (y from 8 to 192)
POINTS = 40                # control points kept around the outline


def load(path):
    return [tuple(p) for p in json.load(open(path))['pts']]


def rotate_tall(pts):
    # photo symbol is wide; turn it 90 degrees so it is tall
    return [(y, -x) for x, y in pts]


def symmetrize(pts):
    n = len(pts)
    cx = sum(p[0] for p in pts) / n
    cy = sum(p[1] for p in pts) / n
    # find the index offset that best pairs each point with its antipode
    best, best_err = 0, float('inf')
    for off in range(n):
        err = 0.0
        for i in range(n):
            j = (i + off) % n
            err += (pts[i][0] + pts[j][0] - 2 * cx) ** 2 + (pts[i][1] + pts[j][1] - 2 * cy) ** 2
        if err < best_err:
            best, best_err = off, err
    out = []
    for i in range(n):
        j = (i + best) % n
        mx, my = 2 * cx - pts[j][0], 2 * cy - pts[j][1]
        out.append(((pts[i][0] + mx) / 2, (pts[i][1] + my) / 2))
    return out


def fit_box(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    s = LONG_AXIS / h
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    return [((x - cx) * s + 50, (y - cy) * s + 100) for x, y in pts]


def resample(pts, m):
    # closed polyline, equal arc-length spacing
    n = len(pts)
    cum = [0.0]
    for i in range(1, n + 1):
        a, b = pts[i - 1], pts[i % n]
        cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    L = cum[-1]
    out = []
    for k in range(m):
        t = k / m * L
        i = next(i for i in range(1, n + 1) if cum[i] >= t)
        f = (t - cum[i - 1]) / ((cum[i] - cum[i - 1]) or 1)
        a, b = pts[i - 1], pts[i % n]
        out.append((a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])))
    return out


def catmull_rom(pts):
    n = len(pts)
    d = []
    for i in range(n):
        p0, p1, p2, p3 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append('C%.1f %.1f %.1f %.1f %.1f %.1f' % (c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]))
    return 'M%.1f %.1f ' % pts[0] + ' '.join(d) + ' Z'


if __name__ == '__main__':
    pts = load(sys.argv[1] if len(sys.argv) > 1 else 'trace.json')
    pts = fit_box(symmetrize(rotate_tall(pts)))
    pts = resample(pts, POINTS)
    print(catmull_rom(pts))
