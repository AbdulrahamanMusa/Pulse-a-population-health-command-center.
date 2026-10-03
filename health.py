"""Population-health logic for the Pulse command center.

Everything here is pure (DataFrame in, JSON-able dict out) so it can be tested
without starting a Shiny session. The registry is synthetic: no real patients.
"""

from __future__ import annotations

from datetime import date, timedelta
from functools import cache

import numpy as np
import pandas as pd

TODAY = date(2026, 10, 1)

CONDITIONS = [
    "diabetes",
    "hypertension",
    "copd",
    "heart_failure",
    "ckd",
    "asthma",
    "depression",
]
CONDITION_LABELS = {
    "diabetes": "Diabetes",
    "hypertension": "Hypertension",
    "copd": "COPD",
    "heart_failure": "Heart failure",
    "ckd": "CKD",
    "asthma": "Asthma",
    "depression": "Depression",
}
REGIONS = ["North", "South", "East", "West", "Central"]
INSURANCE = ["Medicare", "Medicaid", "Private", "Uninsured"]
AGE_BANDS = [(18, 34), (35, 49), (50, 64), (65, 79), (80, 120)]

READMIT_COST = 15_200  # average cost of one 30-day readmission, USD
PROGRAM_COST = 650  # care-coordination cost per enrolled patient per year, USD
PROGRAM_EFFECT = 0.22  # relative risk reduction from care coordination

# Plausible ranges; values outside are treated as data-entry errors.
QUALITY_RULES = {
    "age": (18, 110),
    "bmi": (12, 80),
    "sbp": (60, 260),
    "dbp": (30, 160),
    "hba1c": (3, 20),
    "ldl": (10, 400),
    "egfr": (1, 150),
}

_FIRST = (
    "Amara Kofi Lena Diego Priya Tomas Ines Yusuf Mei Oluwaseun Hana Mateo Zara "
    "Ravi Elif Noah Aisha Lucas Sofia Kenji Fatima Liam Nia Omar Chloe Arjun "
    "Ingrid Malik Rosa Ethan Leila Felix Grace Dmitri Ama Pablo Sara Ibrahim"
).split()
_LAST = (
    "Okafor Silva Novak Haddad Tanaka Mensah Rossi Kowalski Nguyen Adeyemi Larsen "
    "Patel Moreau Ibrahim Schmidt Costa Yilmaz Owusu Reyes Kim Bauer Diallo Fischer "
    "Hassan Murphy Ortiz Sato Jensen Abiodun Kaur Petrov Lindqvist Mwangi"
).split()


# --------------------------------------------------------------------------
# Risk model
# --------------------------------------------------------------------------

def risk_terms(df: pd.DataFrame) -> pd.DataFrame:
    """Logit contributions of each driver of 30-day readmission risk.

    A hand-tuned logistic model, deliberately transparent so every patient's
    score can be explained term by term.
    """
    hba1c = df["hba1c"].fillna(df["hba1c"].median())
    sbp = df["sbp"].fillna(df["sbp"].median()).clip(60, 260)
    egfr = df["egfr"].fillna(df["egfr"].median())
    return pd.DataFrame(
        {
            "Age": 0.022 * (df["age"].clip(18, 110) - 55),
            "Prior admissions": 0.42 * df["admissions_12m"].clip(upper=6),
            "ED visits": 0.14 * df["ed_visits_12m"].clip(upper=8),
            "Heart failure": 0.55 * df["heart_failure"],
            "COPD": 0.38 * df["copd"],
            "CKD": 0.30 * df["ckd"],
            "Diabetes": 0.18 * df["diabetes"],
            "Depression": 0.20 * df["depression"],
            "Glycemic control": 0.28 * (hba1c - 7).clip(lower=0),
            "Blood pressure": 0.014 * (sbp - 130).clip(lower=0),
            "Kidney function": 0.012 * (60 - egfr).clip(lower=0),
            "Smoking": 0.35 * df["smoker"],
        },
        index=df.index,
    )


RISK_INTERCEPT = -3.1


def readmission_risk(df: pd.DataFrame) -> pd.Series:
    z = RISK_INTERCEPT + risk_terms(df).sum(axis=1)
    return 1 / (1 + np.exp(-z))


def risk_tier(p: pd.Series | np.ndarray) -> np.ndarray:
    p = np.asarray(p)
    return np.select(
        [p < 0.10, p < 0.20, p < 0.35], ["Low", "Moderate", "High"], "Very high"
    )


# --------------------------------------------------------------------------
# Synthetic registry
# --------------------------------------------------------------------------

def make_registry(n: int = 3000, seed: int = 7) -> pd.DataFrame:
    """A synthetic patient registry, including realistic data-quality defects."""
    rng = np.random.default_rng(seed)
    age = rng.normal(57, 17, n).clip(18, 97).round().astype(int)
    a = (age - 18) / 80

    sex = rng.choice(["Female", "Male"], n, p=[0.52, 0.48])
    region = rng.choice(REGIONS, n, p=[0.22, 0.20, 0.18, 0.20, 0.20])
    insurance = np.where(
        age >= 65,
        rng.choice(INSURANCE, n, p=[0.82, 0.08, 0.10, 0.0]),
        rng.choice(INSURANCE, n, p=[0.0, 0.26, 0.60, 0.14]),
    )

    p_cond = {
        "diabetes": 0.05 + 0.25 * a,
        "hypertension": 0.10 + 0.55 * a,
        "copd": 0.02 + 0.14 * a,
        "heart_failure": 0.005 + 0.15 * a**2,
        "ckd": 0.02 + 0.20 * a**2,
        "asthma": np.full(n, 0.09),
        "depression": np.full(n, 0.16),
    }
    cond = {c: rng.random(n) < p for c, p in p_cond.items()}
    smoker = rng.random(n) < (0.22 - 0.10 * a)

    bmi = rng.normal(27.5 + 3 * cond["diabetes"], 5, n).clip(15, 60)
    sbp = rng.normal(121 + 17 * cond["hypertension"] + 0.25 * (age - 50), 13, n)
    dbp = sbp * 0.58 + rng.normal(6, 6, n)
    hba1c = np.where(
        cond["diabetes"], rng.normal(7.9, 1.3, n), rng.normal(5.4, 0.35, n)
    ).clip(4, 14)
    ldl = rng.normal(115, 32, n).clip(40, 260)
    egfr = (rng.normal(96, 14, n) - 0.6 * (age - 40).clip(0) - 28 * cond["ckd"]).clip(
        6, 130
    )
    admissions = rng.poisson(
        0.12 + 0.7 * cond["heart_failure"] + 0.45 * cond["copd"] + 0.3 * cond["ckd"]
        + 0.1 * cond["diabetes"]
    )
    ed = rng.poisson(
        0.3 + 0.5 * cond["copd"] + 0.45 * cond["asthma"] + 0.3 * cond["depression"]
        + 0.2 * smoker
    )

    first = rng.choice(_FIRST, n)
    last = rng.choice(_LAST, n)
    df = pd.DataFrame(
        {
            "patient_id": [f"P{i:05d}" for i in range(1, n + 1)],
            "name": [f"{f} {l}" for f, l in zip(first, last)],
            "age": age,
            "sex": sex,
            "region": region,
            "insurance": insurance,
            **{c: cond[c] for c in CONDITIONS},
            "smoker": smoker,
            "bmi": bmi.round(1),
            "sbp": sbp.round(),
            "dbp": dbp.round(),
            "hba1c": hba1c.round(1),
            "ldl": ldl.round(),
            "egfr": egfr.round(),
            "admissions_12m": admissions,
            "ed_visits_12m": ed,
        }
    )
    df["risk"] = readmission_risk(df)
    df["readmit_30d"] = (rng.random(n) < df["risk"]) & (df["admissions_12m"] > 0)
    n_cond = df[CONDITIONS].sum(axis=1)
    df["cost_12m"] = (
        900 + 850 * n_cond + 2600 * ed + 11_500 * admissions
        + READMIT_COST * df["readmit_30d"] + rng.gamma(2, 700, n)
    ).round()
    df["last_visit"] = [
        (TODAY - timedelta(days=int(d))).isoformat() for d in rng.integers(0, 540, n)
    ]

    # Data-quality defects, the kind every real registry has.
    for col, rate in {"hba1c": 0.05, "ldl": 0.07, "bmi": 0.03, "egfr": 0.02}.items():
        df.loc[rng.random(n) < rate, col] = np.nan
    bad_sbp = rng.random(n) < 0.006
    df.loc[bad_sbp, "sbp"] = (df.loc[bad_sbp, "sbp"] * 2.3).round()  # keyed twice
    bad_bmi = rng.random(n) < 0.004
    df.loc[bad_bmi, "bmi"] = (df.loc[bad_bmi, "bmi"] * 10).round(1)  # decimal slip
    dupes = df.sample(frac=0.012, random_state=seed)
    return pd.concat([df, dupes], ignore_index=True)


@cache
def load_registry() -> pd.DataFrame:
    """The shared registry, built once per process (Express re-runs app.py per session)."""
    return make_registry()


@cache
def load_clean_registry() -> tuple[pd.DataFrame, dict]:
    return clean_registry(load_registry())


def clean_registry(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Apply the cleaning rules: dedupe, null out implausible values, impute."""
    out = df.drop_duplicates("patient_id").copy()
    log = {"duplicates_removed": int(len(df) - len(out))}
    flagged = 0
    for col, (lo, hi) in QUALITY_RULES.items():
        bad = out[col].notna() & ~out[col].between(lo, hi)
        flagged += int(bad.sum())
        out.loc[bad, col] = np.nan
    log["out_of_range_nulled"] = flagged
    imputed = 0
    for col in ["bmi", "sbp", "dbp", "hba1c", "ldl", "egfr"]:
        # Impute within diabetes status so HbA1c medians stay clinically sane.
        med = out.groupby("diabetes")[col].transform("median")
        miss = out[col].isna()
        imputed += int(miss.sum())
        out.loc[miss, col] = med[miss].round(1)
    log["values_imputed"] = imputed
    return out, log


def data_quality(df: pd.DataFrame) -> dict:
    fields = []
    for col in ["age", "bmi", "sbp", "dbp", "hba1c", "ldl", "egfr"]:
        lo, hi = QUALITY_RULES[col]
        s = df[col]
        missing = int(s.isna().sum())
        out_of_range = int((s.notna() & ~s.between(lo, hi)).sum())
        fields.append(
            {
                "field": col,
                "missing": missing,
                "missing_pct": round(100 * missing / len(df), 2),
                "out_of_range": out_of_range,
                "range": [lo, hi],
                "valid_pct": round(100 * (1 - (missing + out_of_range) / len(df)), 2),
            }
        )
    duplicates = int(df["patient_id"].duplicated().sum())
    cells = len(df) * len(fields)
    bad = sum(f["missing"] + f["out_of_range"] for f in fields)
    stale = int((pd.to_datetime(df["last_visit"]) < pd.Timestamp(TODAY) - pd.Timedelta(days=365)).sum())
    return {
        "records": int(len(df)),
        "unique_patients": int(df["patient_id"].nunique()),
        "duplicates": duplicates,
        "stale_records": stale,
        "completeness": round(100 * (1 - bad / cells), 2),
        "fields": fields,
    }


# --------------------------------------------------------------------------
# Cohort analytics
# --------------------------------------------------------------------------

def filter_cohort(
    df: pd.DataFrame,
    age_range: list[int] | tuple[int, int] = (18, 120),
    sexes: list[str] | None = None,
    regions: list[str] | None = None,
    conditions: list[str] | None = None,
    condition_mode: str = "any",
) -> pd.DataFrame:
    lo, hi = age_range
    keep = df["age"].between(lo, hi)
    if sexes:
        keep &= df["sex"].isin(sexes)
    if regions:
        keep &= df["region"].isin(regions)
    conditions = [c for c in (conditions or []) if c in CONDITIONS]
    if conditions:
        has = df[conditions]
        keep &= has.all(axis=1) if condition_mode == "all" else has.any(axis=1)
    return df[keep]


def _pct(num: float, den: float) -> float | None:
    return round(100 * float(num) / den, 1) if den else None


def kpis(df: pd.DataFrame) -> dict:
    n = len(df)
    admitted = df[df["admissions_12m"] > 0]
    htn = df[df["hypertension"]]
    dm = df[df["diabetes"]]
    tiers = risk_tier(df["risk"])
    return {
        "patients": n,
        "mean_age": round(float(df["age"].mean()), 1) if n else None,
        "mean_risk": round(100 * float(df["risk"].mean()), 1) if n else None,
        "high_risk": int(np.isin(tiers, ["High", "Very high"]).sum()),
        "readmit_rate": _pct(admitted["readmit_30d"].sum(), len(admitted)),
        "total_cost": float(df["cost_12m"].sum()),
        "cost_per_patient": round(float(df["cost_12m"].mean())) if n else None,
        "ed_per_1000": round(1000 * float(df["ed_visits_12m"].mean())) if n else None,
        "bp_controlled": _pct((htn["sbp"] < 140).sum(), len(htn)),
        "a1c_controlled": _pct((dm["hba1c"] < 8).sum(), len(dm)),
        "tiers": {t: int((tiers == t).sum()) for t in ["Low", "Moderate", "High", "Very high"]},
    }


def risk_histogram(risk: pd.Series, width: float = 0.025, top: float = 0.6) -> list[dict]:
    edges = np.arange(0, top + width, width)
    clipped = np.clip(np.asarray(risk), 0, top - 1e-9)
    counts, _ = np.histogram(clipped, bins=edges)
    return [
        {
            "lo": round(float(lo), 3),
            "hi": round(float(hi), 3),
            "label": f"{lo * 100:.1f}%",
            "count": int(c),
            "tier": str(risk_tier(np.array([lo]))[0]),
        }
        for lo, hi, c in zip(edges[:-1], edges[1:], counts)
    ]


def breakdown(df: pd.DataFrame) -> dict:
    age_rows = []
    for lo, hi in AGE_BANDS:
        band = df[df["age"].between(lo, hi)]
        row = {"band": f"{lo}–{hi}" if hi < 120 else f"{lo}+"}
        for sex in ["Female", "Male"]:
            s = band[band["sex"] == sex]
            row[sex] = round(100 * float(s["risk"].mean()), 1) if len(s) else 0
            row[f"{sex}_n"] = int(len(s))
        age_rows.append(row)
    region_rows = []
    for r in REGIONS:
        s = df[df["region"] == r]
        region_rows.append(
            {
                "region": r,
                "patients": int(len(s)),
                "mean_risk": round(100 * float(s["risk"].mean()), 1) if len(s) else 0,
                "cost_per_patient": round(float(s["cost_12m"].mean())) if len(s) else 0,
            }
        )
    prevalence = [
        {"condition": CONDITION_LABELS[c], "key": c, "pct": _pct(df[c].sum(), len(df)) or 0}
        for c in CONDITIONS
    ]
    return {"age_sex": age_rows, "region": region_rows, "prevalence": prevalence}


def comorbidity(df: pd.DataFrame) -> dict:
    """Co-occurrence counts and lift (observed / expected under independence)."""
    n = len(df)
    m = df[CONDITIONS].to_numpy(dtype=float)
    counts = m.T @ m
    prev = m.mean(axis=0) if n else np.zeros(len(CONDITIONS))
    cells = []
    for i, ci in enumerate(CONDITIONS):
        for j, cj in enumerate(CONDITIONS):
            expected = n * prev[i] * prev[j]
            lift = counts[i, j] / expected if expected and i != j else None
            cells.append(
                {
                    "i": i,
                    "j": j,
                    "count": int(counts[i, j]),
                    "lift": round(float(lift), 2) if lift is not None else None,
                }
            )
    multi = df[CONDITIONS].sum(axis=1)
    return {
        "labels": [CONDITION_LABELS[c] for c in CONDITIONS],
        "cells": cells,
        "multimorbidity": [
            {"conditions": str(k) if k < 4 else "4+", "patients": int(v)}
            for k, v in multi.clip(upper=4).value_counts().sort_index().items()
        ],
    }


def _conditions_of(row: pd.Series) -> list[str]:
    return [CONDITION_LABELS[c] for c in CONDITIONS if bool(row[c])]


def patient_list(df: pd.DataFrame, search: str = "", limit: int = 80) -> dict:
    s = df.drop_duplicates("patient_id")
    q = (search or "").strip().lower()
    if q:
        s = s[
            s["patient_id"].str.lower().str.contains(q, regex=False)
            | s["name"].str.lower().str.contains(q, regex=False)
        ]
    top = s.sort_values("risk", ascending=False).head(limit)
    tiers = risk_tier(top["risk"])
    return {
        "total": int(len(s)),
        "rows": [
            {
                "id": r["patient_id"],
                "name": r["name"],
                "age": int(r["age"]),
                "sex": r["sex"],
                "region": r["region"],
                "risk": round(100 * float(r["risk"]), 1),
                "tier": str(t),
                "conditions": _conditions_of(r),
            }
            for (_, r), t in zip(top.iterrows(), tiers)
        ],
    }


def _num(v) -> float | None:
    return None if pd.isna(v) else float(v)


def patient_detail(df: pd.DataFrame, patient_id: str) -> dict | None:
    rows = df[df["patient_id"] == patient_id]
    if rows.empty:
        return None
    row = rows.iloc[[0]]
    r = row.iloc[0]
    terms = risk_terms(row).iloc[0]
    drivers = sorted(
        ({"driver": k, "logit": round(float(v), 3)} for k, v in terms.items() if abs(v) > 0.005),
        key=lambda d: -abs(d["logit"]),
    )

    # A deterministic 24-month history that lands on today's values.
    rng = np.random.default_rng(int(patient_id[1:]))
    months = 24
    visits = sorted(rng.choice(np.arange(1, months), size=9, replace=False)) + [months]
    a1c_now = _num(r["hba1c"]) or 5.6
    sbp_now = min(_num(r["sbp"]) or 128, 220)
    bmi_now = min(_num(r["bmi"]) or 27, 60)
    timeline = []
    for k, mth in enumerate(visits):
        back = (months - mth) / months
        when = TODAY - timedelta(days=int((months - mth) * 30.4))
        timeline.append(
            {
                "date": when.isoformat(),
                "hba1c": round(a1c_now + back * rng.normal(0.9 if r["diabetes"] else 0.1, 0.3) + rng.normal(0, 0.15), 1),
                "sbp": round(sbp_now + back * rng.normal(10, 6) + rng.normal(0, 5)),
                "bmi": round(bmi_now + back * rng.normal(1.2, 0.6) + rng.normal(0, 0.3), 1),
            }
        )
    timeline[-1].update(hba1c=round(a1c_now, 1), sbp=round(sbp_now), bmi=round(bmi_now, 1))

    events = []
    for _ in range(int(r["admissions_12m"])):
        d = TODAY - timedelta(days=int(rng.integers(5, 360)))
        events.append({"date": d.isoformat(), "kind": "Admission", "detail": str(rng.choice(["Acute exacerbation", "Chest pain", "Fluid overload", "Pneumonia", "Hyperglycemia", "Fall"]))})
    for _ in range(int(r["ed_visits_12m"])):
        d = TODAY - timedelta(days=int(rng.integers(5, 360)))
        events.append({"date": d.isoformat(), "kind": "ED visit", "detail": str(rng.choice(["Shortness of breath", "Dizziness", "Asthma attack", "Hypertensive urgency", "Anxiety"]))})
    for _ in range(int(rng.integers(1, 4))):
        d = TODAY - timedelta(days=int(rng.integers(5, 700)))
        events.append({"date": d.isoformat(), "kind": "Medication", "detail": str(rng.choice(["Metformin titrated", "ACE inhibitor started", "Statin started", "Inhaler switched", "SGLT2 inhibitor added", "Diuretic adjusted"]))})
    events.sort(key=lambda e: e["date"], reverse=True)

    risk = float(r["risk"])
    return {
        "id": r["patient_id"],
        "name": r["name"],
        "age": int(r["age"]),
        "sex": r["sex"],
        "region": r["region"],
        "insurance": r["insurance"],
        "smoker": bool(r["smoker"]),
        "conditions": _conditions_of(r),
        "risk": round(100 * risk, 1),
        "tier": str(risk_tier(np.array([risk]))[0]),
        "vitals": {k: _num(r[k]) for k in ["bmi", "sbp", "dbp", "hba1c", "ldl", "egfr"]},
        "utilization": {
            "admissions_12m": int(r["admissions_12m"]),
            "ed_visits_12m": int(r["ed_visits_12m"]),
            "cost_12m": float(r["cost_12m"]),
            "last_visit": r["last_visit"],
        },
        "intercept": RISK_INTERCEPT,
        "drivers": drivers,
        "timeline": timeline,
        "events": events,
    }


# --------------------------------------------------------------------------
# What-if simulator
# --------------------------------------------------------------------------

def simulate(
    df: pd.DataFrame,
    hba1c_drop: float = 0.0,
    sbp_drop: float = 0.0,
    smoking_quit_pct: float = 0.0,
    enroll_pct: float = 0.0,
) -> dict:
    """Project readmissions and cost under a population-health intervention."""
    base = df.drop_duplicates("patient_id")
    n = len(base)
    if n == 0:
        return {"patients": 0}
    sc = base.copy()
    dm = sc["diabetes"]
    sc.loc[dm, "hba1c"] = (sc.loc[dm, "hba1c"] - hba1c_drop).clip(lower=5.7)
    htn = sc["hypertension"]
    sc.loc[htn, "sbp"] = (sc.loc[htn, "sbp"] - sbp_drop).clip(lower=110)
    smokers = sc.index[sc["smoker"]]
    quitters = smokers[: int(round(len(smokers) * smoking_quit_pct / 100))]
    sc.loc[quitters, "smoker"] = False
    risk = readmission_risk(sc)

    # Enroll the highest-risk patients in care coordination.
    n_enroll = int(round(n * enroll_pct / 100))
    enrolled = risk.sort_values(ascending=False).index[:n_enroll]
    risk.loc[enrolled] *= 1 - PROGRAM_EFFECT

    base_risk = readmission_risk(base)
    baseline_events = float(base_risk.sum())
    scenario_events = float(risk.sum())
    avoided = baseline_events - scenario_events
    savings = avoided * READMIT_COST
    program_cost = n_enroll * PROGRAM_COST
    base_tiers = risk_tier(base_risk)
    sc_tiers = risk_tier(risk)
    hist_b = risk_histogram(base_risk)
    hist_s = risk_histogram(risk)
    return {
        "patients": n,
        "enrolled": n_enroll,
        "quitters": len(quitters),
        "baseline_events": round(baseline_events, 1),
        "scenario_events": round(scenario_events, 1),
        "avoided": round(avoided, 1),
        "savings": round(savings),
        "program_cost": program_cost,
        "net": round(savings - program_cost),
        "roi": round((savings - program_cost) / program_cost, 2) if program_cost else None,
        "nnt": round(n_enroll / avoided, 1) if avoided > 0 and n_enroll else None,
        "tiers": [
            {"tier": t, "baseline": int((base_tiers == t).sum()), "scenario": int((sc_tiers == t).sum())}
            for t in ["Low", "Moderate", "High", "Very high"]
        ],
        "histogram": [
            {"label": b["label"], "baseline": b["count"], "scenario": s["count"]}
            for b, s in zip(hist_b, hist_s)
        ],
    }


def cohort_csv(df: pd.DataFrame) -> str:
    out = df.drop_duplicates("patient_id").copy()
    out["risk_pct"] = (100 * out["risk"]).round(1)
    out["risk_tier"] = risk_tier(out["risk"])
    return out.drop(columns=["risk"]).to_csv(index=False)
