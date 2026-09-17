#!/usr/bin/env python3
"""Generate the SVG path for the squiggle symbol used in js/cards.js.

The symbol lives in a 100x200 box. The outline is a constant-ish width tube
around a sine centerline with semicircular caps, smoothed with Catmull-Rom
splines converted to cubic Beziers. Run and paste the output into
SHAPE_PATHS.squiggle.
"""
import math

N = 36
TOP, BOT = 33, 167       # centerline y extent
AMP = 13                 # wave amplitude
W0 = 24                  # half width
PHASE = -0.35


def center(t):
    return 50 + AMP * math.sin(2 * math.pi * t + PHASE) + (0.5 - t) * 6, TOP + (BOT - TOP) * t


def width(t):
    return W0 + 3 * abs(math.sin(2 * math.pi * t + PHASE))


def frame(t):
    x, y = center(t)
    x2, y2 = center(min(t + 1e-3, 1))
    x1, y1 = center(max(t - 1e-3, 0))
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    tx, ty = dx / L, dy / L
    return (x, y), (tx, ty), (-ty, tx)


def sides():
    left, right = [], []
    for i in range(N + 1):
        t = i / N
        (x, y), _, (nx, ny) = frame(t)
        w = width(t)
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    return left, right


def cap(t, arrive_sign, tdir):
    (x, y), (tx, ty), (nx, ny) = frame(t)
    w = width(t)
    out = []
    for k in range(1, 6):
        a = math.pi * k / 6
        ox = arrive_sign * math.cos(a) * nx + math.sin(a) * tx * tdir
        oy = arrive_sign * math.cos(a) * ny + math.sin(a) * ty * tdir
        out.append((x + ox * w, y + oy * w))
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
    left, right = sides()
    poly = right[::4] + cap(1.0, -1, +1) + left[::-1][::4] + cap(0.0, +1, -1)
    print(catmull_rom(poly))
