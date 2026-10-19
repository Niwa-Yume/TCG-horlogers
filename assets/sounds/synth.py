"""WristMasters TCG — sons de remplacement synthétisés.

Aucun échantillon externe : chaque son est calculé (bruit filtré + partiels
inharmoniques), pour servir de placeholder en attendant de vrais
enregistrements de mouvements. Usage : python3 synth.py <dossier_sortie>
"""
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
rng = np.random.default_rng(1735)  # graine fixe : rendu reproductible


def t(dur):
    return np.arange(int(SR * dur)) / SR


def band(x, lo, hi, order=4):
    sos = butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return sosfilt(sos, x)


def high(x, f, order=2):
    sos = butter(order, f, btype="high", fs=SR, output="sos")
    return sosfilt(sos, x)


def env(dur, attack, decay):
    tt = t(dur)
    a = np.clip(tt / max(attack, 1e-6), 0, 1)
    return a * np.exp(-tt / decay)


def norm(x, peak=0.89):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def fade_out(x, ms=8):
    n = int(SR * ms / 1000)
    if n and len(x) > n:
        x[-n:] *= np.linspace(1, 0, n)
    return x


def pad(x, dur):
    out = np.zeros(int(SR * dur))
    out[: len(x)] += x[: len(out)]
    return out


def place(buf, x, at):
    i = int(SR * at)
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i]


# ---------- briques ----------

def click(freq=4200, dur=0.045, bright=1.0, body=0.25):
    """Transitoire métallique : bruit très court filtré + résonance."""
    n = rng.standard_normal(int(SR * dur))
    tr = band(n, freq * 0.7, min(freq * 1.6, SR / 2 - 100)) * env(dur, 0.0004, 0.0035) * bright
    res = np.sin(2 * np.pi * freq * t(dur)) * env(dur, 0.0005, 0.009) * 0.35
    res2 = np.sin(2 * np.pi * freq * 1.53 * t(dur)) * env(dur, 0.0005, 0.005) * 0.18
    thump = np.sin(2 * np.pi * 180 * t(dur)) * env(dur, 0.001, 0.006) * body
    return fade_out(tr + res + res2 + thump)


def gong(f0, dur=2.8, strength=1.0):
    """Timbre de répétition : partiels inharmoniques d'une tige d'acier."""
    ratios = [1.0, 2.76, 5.40, 8.93, 13.3]
    amps = [1.0, 0.55, 0.32, 0.18, 0.08]
    decays = [1.4, 0.9, 0.55, 0.32, 0.18]
    tt = t(dur)
    x = np.zeros_like(tt)
    for r, a, d in zip(ratios, amps, decays):
        f = f0 * r
        if f < SR / 2 - 200:
            beat = 1 + 0.004 * np.sin(2 * np.pi * 3.1 * tt)  # léger battement
            x += a * np.sin(2 * np.pi * f * tt * beat) * np.exp(-tt / d)
    strike = band(rng.standard_normal(len(tt)), 2000, 9000) * env(dur, 0.0003, 0.004) * 0.6
    x = (x + strike) * np.clip(tt / 0.0015, 0, 1)
    return fade_out(x * strength, 40)


# ---------- sons livrés ----------

def cliquet():
    return norm(pad(click(4300, 0.05, 1.0, 0.2), 0.08))


def armage():
    """12 crans de remontage, la tension monte (cadence et hauteur)."""
    buf = np.zeros(int(SR * 1.9))
    at = 0.02
    for k in range(12):
        f = 3900 + k * 45
        place(buf, click(f, 0.05, 1.0 - k * 0.02, 0.18 + k * 0.01), at)
        at += 0.15 - k * 0.004
    return norm(fade_out(buf, 30))


def ressort():
    """Libération du ressort : glissement métallique descendant + souffle."""
    dur = 0.75
    tt = t(dur)
    f = 1400 * np.exp(-tt * 3.2) + 220
    phase = 2 * np.pi * np.cumsum(f) / SR
    tone = np.sin(phase) * np.exp(-tt / 0.28) * 0.6
    tone += np.sin(phase * 2.31) * np.exp(-tt / 0.16) * 0.25
    air = band(rng.standard_normal(len(tt)), 600, 5000) * np.exp(-tt / 0.18) * 0.5
    snap = np.zeros_like(tt)
    snap[: len(click(5200, 0.05))] += click(5200, 0.05, 1.2, 0.4)
    return norm(fade_out(tone + air + snap, 60))


def tic():
    return norm(pad(click(2900, 0.04, 0.9, 0.35), 0.06), 0.8)


def tac():
    return norm(pad(click(2350, 0.04, 0.8, 0.45), 0.06), 0.75)


def timbre():
    return norm(gong(1180, 3.0))


def repetition_minutes(hours=3, quarters=3, minutes=2):
    """Sonne une heure comme une vraie répétition minutes :
    heures = timbre grave, quarts = paires aigu-grave, minutes = timbre aigu.
    Par défaut 3 h 47."""
    low, hi = 820, 1180
    buf = np.zeros(int(SR * 9.5))
    at = 0.05
    for _ in range(hours):
        place(buf, gong(low, 2.6), at)
        at += 0.55
    at += 0.45
    for _ in range(quarters):
        place(buf, gong(hi, 2.2, 0.9), at)
        place(buf, gong(low, 2.4, 0.9), at + 0.19)
        at += 0.62
    at += 0.35
    for _ in range(minutes):
        place(buf, gong(hi, 2.6), at)
        at += 0.42
    end = int(SR * (at + 2.4))
    return norm(fade_out(buf[:end], 300))


def revelation():
    """Carte qui glisse : souffle de papier filtré en balayage."""
    dur = 0.32
    tt = t(dur)
    n = rng.standard_normal(len(tt))
    x = np.zeros_like(tt)
    # balayage par blocs de filtres
    blocks = 8
    size = len(tt) // blocks
    for b in range(blocks):
        lo = 500 + b * 350
        seg = band(n, lo, lo * 3.2)[b * size:(b + 1) * size]
        x[b * size:b * size + len(seg)] = seg
    x *= np.sin(np.pi * tt / dur) ** 1.5
    return norm(fade_out(high(x, 300), 30), 0.6)


SOUNDS = {
    "cliquet": cliquet,
    "armage": armage,
    "ressort": ressort,
    "tic": tic,
    "tac": tac,
    "timbre": timbre,
    "repetition-minutes": repetition_minutes,
    "revelation": revelation,
}


def main(out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    for name, fn in SOUNDS.items():
        x = fn()
        wavfile.write(out / f"{name}.wav", SR, (x * 32767).astype(np.int16))
        print(f"{name}.wav  {len(x) / SR:.2f}s")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "out")
