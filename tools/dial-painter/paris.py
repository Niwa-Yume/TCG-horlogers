"""Paris sous le Directoire et le Consulat : Notre-Dame (sans sa flèche, déposée
en 1786-1792), la Conciergerie et la tour de l'Horloge, les quais, le pont."""
import math
import numpy as np
from scipy import ndimage as ndi
from wm_paint import W, H, YY, XX, Layer, fbm, smooth
from vedute import Group, lay, air, split, ramp_x, ramp_y, disc, LDIR


def notre_dame(G, rng, x0, base, u=3.6, d=0.3, lit=0.86, sh=0.6, roof=0.5):
    """Élévation sud, de biais : tours de l'ouest à gauche, nef et arcs-boutants,
    croisillon sud et sa rose, chevet à droite. 1 m = u px."""
    X = lambda m: x0 + m * u
    Y = lambda m: base - m * u
    A = lambda v: air(v, d)
    # nef : bas-côtés, claire-voie, toiture
    G.put(lay(0.3).rect(X(16), Y(21), X(104), Y(0)).arr(), ramp_x(X(16), X(104), A(lit - 0.06), A(lit - 0.14)), flow=math.pi / 2, fw=0.5, ln=0.6)
    G.put(lay(0.3).rect(X(16), Y(34), X(104), Y(21)).arr(), ramp_x(X(16), X(104), A(sh + 0.06), A(sh - 0.04)), flow=math.pi / 2, fw=0.5, ln=0.6)
    G.put(lay(0.3).poly([(X(16), Y(34)), (X(104), Y(34)), (X(103), Y(43)), (X(17), Y(43))]).arr(), ramp_y(Y(43), Y(34), A(roof + 0.1), A(roof - 0.08)), flow=0.0, fw=0.6, ln=1.2)
    win = lay(0.2)
    for k in range(10):
        x = X(20 + k * 8.4)
        if 50 < (x - x0) / u < 64:
            continue
        win.rect(x, Y(31.5), x + 2.2 * u, Y(23.5))
        win.rect(x + 0.2 * u, Y(16), x + 1.9 * u, Y(8))
    G.put(win.arr(), A(0.36))
    # arcs-boutants et culées à pinacles
    fb = lay(0.25)
    piers = lay(0.25)
    for k in range(11):
        mx = 18 + k * 8.4
        if 50 < mx < 64:
            continue
        px = X(mx)
        piers.rect(px - 0.9 * u, Y(29), px + 0.9 * u, Y(0))
        piers.poly([(px - 0.9 * u, Y(29)), (px + 0.9 * u, Y(29)), (px, Y(35))])
        for lo_, hi_, w_ in ((15.5, 21.5, 0.8), (25, 32.5, 1.0)):
            pts = []
            for j in range(10):
                t = j / 9
                pts.append((px + t * 4.2 * u, Y(lo_ + (hi_ - lo_) * math.sin(t * math.pi / 2))))
            fb.line(pts, w_ * u)
    G.put(piers.arr(), ramp_x(0, W, A(lit + 0.06), A(lit - 0.02)), flow=math.pi / 2, fw=0.6)
    G.put(fb.arr(), A(lit + 0.02))
    G.ink(fb.arr() * 0 + lay(0.0).line([(X(18), Y(25)), (X(104), Y(25))], 0.6).arr(), 0.15)
    # croisillon sud : pignon, rose, portail
    tx0, tx1 = X(52), X(63)
    G.put(lay(0.3).poly([(tx0, Y(0)), (tx0, Y(36)), ((tx0 + tx1) / 2, Y(50)), (tx1, Y(36)), (tx1, Y(0))]).arr(),
          ramp_x(tx0, tx1, A(lit + 0.04), A(lit - 0.12)), flow=math.pi / 2, fw=0.5, ln=0.6)
    rc = ((tx0 + tx1) / 2, Y(25))
    G.put(disc(rc[0], rc[1], 4.6 * u, 0.8), A(0.3))
    rose = lay(0.0)
    for k in range(12):
        a = k / 12 * 2 * math.pi
        rose.line([rc, (rc[0] + math.cos(a) * 4.4 * u, rc[1] + math.sin(a) * 4.4 * u)], 0.6)
    G.put(rose.arr() * disc(rc[0], rc[1], 4.6 * u, 0.8), A(0.62))
    G.put(disc(rc[0], rc[1], 1.2 * u, 0.6), A(0.62))
    G.put(lay(0.2).poly([(rc[0] - 2.4 * u, Y(0)), (rc[0] - 2.4 * u, Y(9)), (rc[0], Y(13)), (rc[0] + 2.4 * u, Y(9)), (rc[0] + 2.4 * u, Y(0))]).arr(), A(0.3))
    for xx in (tx0, tx1):
        G.put(lay(0.2).rect(xx - 0.8 * u, Y(40), xx + 0.8 * u, Y(0)).arr(), A(lit))
        G.put(lay(0.2).poly([(xx - 0.8 * u, Y(40)), (xx + 0.8 * u, Y(40)), (xx, Y(46))]).arr(), A(lit - 0.05))
    # chevet : abside en hémicycle, toiture en croupe, arcs rayonnants
    G.put(lay(0.4).poly([(X(104), Y(0)), (X(104), Y(34)), (X(116), Y(33)), (X(124), Y(28)), (X(127), Y(18)), (X(127.5), Y(0))]).arr(),
          ramp_x(X(104), X(128), A(lit - 0.06), A(sh)), flow=math.pi / 2, fw=0.5, ln=0.6)
    G.put(lay(0.3).poly([(X(103), Y(34)), (X(116), Y(33)), (X(124), Y(28)), (X(118), Y(36)), (X(103), Y(43))]).arr(), A(roof - 0.04))
    for k, (mx, top) in enumerate(((108, 30), (114, 29), (120, 26), (125, 21))):
        pts = [(X(mx) + t * 3.0 * u, Y(top - 2 + 5 * math.sin(t * math.pi / 2))) for t in np.linspace(0, 1, 8)]
        G.put(lay(0.2).line(pts, 0.8 * u).arr(), A(lit - 0.1 - 0.06 * k))
    # tours de l'ouest : la tour sud devant, la tour nord en retrait derrière
    for k, (tx, dd) in enumerate(((X(-10), d + 0.08), (X(0), d))):
        AA = lambda v: air(v, dd)
        tw = 16 * u
        G.put(lay(0.3).rect(tx, Y(68), tx + tw, Y(0)).arr(), ramp_x(tx, tx + tw, AA(lit + 0.04), AA(sh)), flow=math.pi / 2, fw=0.6, ln=0.6)
        op = lay(0.2)
        for ox in (3.2, 9.2):
            op.poly([(tx + ox * u, Y(44)), (tx + ox * u, Y(59)), (tx + (ox + 1.8) * u, Y(61.5)), (tx + (ox + 3.6) * u, Y(59)), (tx + (ox + 3.6) * u, Y(44))])
        op.rect(tx + 5 * u, Y(37), tx + 11 * u, Y(31))
        G.put(op.arr(), AA(0.26))
        bt = lay(0.2)
        for ox in (0, 14.6):
            bt.rect(tx + ox * u, Y(66), tx + (ox + 1.4) * u, Y(0))
        G.put(bt.arr(), AA(lit + 0.08))
        cr = lay(0.2)
        cr.rect(tx - 0.4 * u, Y(69.5), tx + tw + 0.4 * u, Y(67.6))
        for j in range(9):
            cr.rect(tx + j * 1.9 * u, Y(71), tx + (j * 1.9 + 0.9) * u, Y(69.5))
        G.put(cr.arr(), AA(lit + 0.06))
        G.ink(lay(0.0).line([(tx, Y(42)), (tx + tw, Y(42))], 0.8).arr(), 0.2)
        G.ink(lay(0.0).line([(tx, Y(29)), (tx + tw, Y(29))], 0.8).arr(), 0.2)


def quay_row(G, rng, x0, x1, base, hmin, hmax, d, lit_windows=0.0, light=None):
    """Maisons de quai parisiennes : hautes, toits à la Mansart, lucarnes, souches."""
    x = x0
    while x < x1:
        w = rng.u(34, 58)
        h = rng.u(hmin, hmax)
        vf = air(rng.u(0.78, 0.88), d)
        G.put(lay(0.3).rect(x, base - h, x + w, base).arr(), ramp_x(x, x + w, vf, vf - 0.08), flow=math.pi / 2, fw=0.5, ln=0.6)
        rh = rng.u(12, 20)
        G.put(lay(0.3).poly([(x - 1, base - h), (x + w + 1, base - h), (x + w - 4, base - h - rh * 0.7), (x + w - 9, base - h - rh), (x + 9, base - h - rh), (x + 4, base - h - rh * 0.7)]).arr(),
              ramp_x(x, x + w, air(0.6, d), air(0.46, d)))
        for k in range(int(w / 16)):
            lx = x + 8 + k * 16
            G.put(lay(0.2).rect(lx, base - h - rh * 0.65, lx + 5, base - h - 2).arr(), air(0.72, d))
        for k in range(rng.i(1, 3)):
            cx = x + rng.u(6, w - 10)
            G.put(lay(0.2).rect(cx, base - h - rh - rng.u(6, 12), cx + 6, base - h - rh + 2).arr(), air(0.55, d))
        rows = max(2, int((h - 10) / 15))
        cols = max(2, int(w / 11))
        wl = lay(0.2)
        lit_l = lay(0.2)
        for i in range(rows):
            for j in range(cols):
                wx = x + (j + 0.5) * w / cols - 2
                wy = base - h + 7 + i * (h - 12) / rows
                (lit_l if rng.u() < lit_windows else wl).rect(wx, wy, wx + 4, wy + 7)
        G.put(wl.arr(), air(0.4, d))
        lm = lit_l.arr()
        G.put(lm, 0.96)
        if light is not None:
            light.append(lm)
        x += w + rng.u(0, 2)


def quay_wall(G, rng, y_top, y_bot, x0=0, x1=W, v=0.6, d=0.2, joints=True):
    m = lay(0.3).rect(x0, y_top, x1, y_bot).arr()
    G.put(m, ramp_y(y_top, y_bot, air(v + 0.08, d), air(v - 0.06, d)), flow=0.0, fw=0.8, ln=1.4)
    G.put(lay(0.2).rect(x0, y_top - 4, x1, y_top + 2).arr(), air(v + 0.18, d), flow=0.0, fw=0.9, ln=1.6)
    if joints:
        jl = lay(0.0)
        for k in range(1, int((y_bot - y_top) / 9)):
            jl.line([(x0, y_top + k * 9), (x1, y_top + k * 9)], 0.6)
        G.ink(jl.arr() * m, 0.12)


def boat(sc_or_G, rng, x, wl, L, d=0.1, v=0.3, lantern=None, rip=None, sc=None):
    G = Group()
    hull = lay(0.4).poly([(x, wl - 8), (x + L * 0.15, wl - 5), (x + L * 0.85, wl - 5), (x + L, wl - 10), (x + L * 0.92, wl + 2), (x + L * 0.08, wl + 2)])
    G.put(hull.arr(), ramp_y(wl - 10, wl, air(v + 0.12, d), air(v - 0.06, d)), flow=0.0, fw=0.8)
    G.put(lay(0.3).line([(x + 2, wl - 7), (x + L * 0.5, wl - 4.5), (x + L - 2, wl - 9)], 1.2).arr(), air(v + 0.3, d))
    return G
