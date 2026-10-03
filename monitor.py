"""Simulated ICU telemetry with NEWS2 early-warning scoring.

NEWS2 thresholds follow the Royal College of Physicians (2017) chart, SpO2
scale 1. The vitals are simulated: each bed drifts around its own baseline, and
a bed flagged as deteriorating slides toward septic-shock physiology until a
clinician intervenes.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

VITALS = ["hr", "rr", "spo2", "sbp", "temp"]

# How far each vital moves at full deterioration (severity = 1).
_DETERIORATION = {"hr": 52, "rr": 15, "spo2": -13, "sbp": -48, "temp": 1.9}
_NOISE = {"hr": 2.2, "rr": 0.7, "spo2": 0.5, "sbp": 2.5, "temp": 0.04}
_LIMITS = {"hr": (25, 210), "rr": (4, 50), "spo2": (60, 100), "sbp": (50, 240), "temp": (33, 42)}

_PATIENTS = [
    ("Amara Okafor", 71, "Post-op CABG"),
    ("Tomas Novak", 64, "Community-acquired pneumonia"),
    ("Mei Tanaka", 82, "Heart failure exacerbation"),
    ("Yusuf Haddad", 55, "Diabetic ketoacidosis"),
    ("Ines Rossi", 47, "Pancreatitis"),
    ("Kofi Mensah", 68, "COPD exacerbation"),
    ("Priya Patel", 39, "Urosepsis"),
    ("Dmitri Petrov", 76, "GI bleed"),
]


def news2(hr: float, rr: float, spo2: float, sbp: float, temp: float, oxygen: bool, conscious: str) -> dict:
    parts = {
        "rr": 3 if rr <= 8 else 1 if rr <= 11 else 0 if rr <= 20 else 2 if rr <= 24 else 3,
        "spo2": 3 if spo2 <= 91 else 2 if spo2 <= 93 else 1 if spo2 <= 95 else 0,
        "oxygen": 2 if oxygen else 0,
        "sbp": 3 if sbp <= 90 else 2 if sbp <= 100 else 1 if sbp <= 110 else 0 if sbp <= 219 else 3,
        "hr": 3 if hr <= 40 else 1 if hr <= 50 else 0 if hr <= 90 else 1 if hr <= 110 else 2 if hr <= 130 else 3,
        "conscious": 0 if conscious == "A" else 3,
        "temp": 3 if temp <= 35.0 else 1 if temp <= 36.0 else 0 if temp <= 38.0 else 1 if temp <= 39.0 else 2,
    }
    score = sum(parts.values())
    if score >= 7:
        level = "high"
    elif score >= 5:
        level = "medium"
    elif any(v == 3 for v in parts.values()):
        level = "low-medium"
    else:
        level = "low"
    return {"score": score, "level": level, "parts": parts}


@dataclass
class Bed:
    id: str
    patient: str
    age: int
    diagnosis: str
    base: dict[str, float]
    now: dict[str, float] = field(default_factory=dict)
    severity: float = 0.0
    deteriorating: bool = False
    oxygen: bool = False
    level: str = "low"

    def __post_init__(self):
        self.now = dict(self.base)


def new_ward(seed: int = 1) -> list[Bed]:
    rng = np.random.default_rng(seed)
    beds = []
    for i, (name, age, dx) in enumerate(_PATIENTS):
        base = {
            "hr": float(rng.normal(80, 8)),
            "rr": float(rng.normal(16, 1.5)),
            "spo2": float(rng.normal(97, 0.8)),
            "sbp": float(rng.normal(124, 9)),
            "temp": float(rng.normal(36.9, 0.25)),
        }
        beds.append(Bed(f"ICU-{i + 1:02d}", name, age, dx, base, oxygen=bool(i in (1, 5))))
    return beds


def step(beds: list[Bed], rng: np.random.Generator) -> list[dict]:
    """Advance every bed by one tick and return a JSON snapshot."""
    for bed in beds:
        if bed.deteriorating:
            bed.severity = min(1.0, bed.severity + rng.uniform(0.025, 0.06))
        else:
            bed.severity = max(0.0, bed.severity - 0.035)
        for v in VITALS:
            target = bed.base[v] + bed.severity * _DETERIORATION[v]
            x = bed.now[v] + 0.35 * (target - bed.now[v]) + rng.normal(0, _NOISE[v])
            lo, hi = _LIMITS[v]
            bed.now[v] = float(np.clip(x, lo, hi))
    return [snapshot(b) for b in beds]


def snapshot(bed: Bed) -> dict:
    conscious = "C" if bed.severity > 0.85 else "A"
    v = bed.now
    score = news2(v["hr"], v["rr"], v["spo2"], v["sbp"], v["temp"], bed.oxygen, conscious)
    return {
        "id": bed.id,
        "patient": bed.patient,
        "age": bed.age,
        "diagnosis": bed.diagnosis,
        "hr": round(v["hr"]),
        "rr": round(v["rr"]),
        "spo2": round(v["spo2"]),
        "sbp": round(v["sbp"]),
        "dbp": round(v["sbp"] * 0.62),
        "temp": round(v["temp"], 1),
        "oxygen": bed.oxygen,
        "conscious": conscious,
        "deteriorating": bed.deteriorating,
        **score,
    }


LEVEL_RANK = {"low": 0, "low-medium": 1, "medium": 2, "high": 3}
