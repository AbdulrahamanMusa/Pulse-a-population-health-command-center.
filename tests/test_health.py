import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd  # noqa: E402

import health  # noqa: E402
import monitor  # noqa: E402

DF = health.make_registry()


def test_registry_is_deterministic_and_has_defects():
    again = health.make_registry()
    pd.testing.assert_frame_equal(DF, again)
    q = health.data_quality(DF)
    assert q["duplicates"] > 0
    assert any(f["out_of_range"] > 0 for f in q["fields"])
    assert any(f["missing"] > 0 for f in q["fields"])


def test_cleaning_removes_every_defect():
    clean, log = health.clean_registry(DF)
    q = health.data_quality(clean)
    assert q["duplicates"] == 0
    assert q["completeness"] == 100.0
    assert log["duplicates_removed"] == len(DF) - len(clean)


def test_risk_tiers_have_inclusive_lower_bounds():
    assert list(health.risk_tier([0.0999, 0.10, 0.1999, 0.20, 0.35])) == [
        "Low", "Moderate", "Moderate", "High", "Very high",
    ]


def test_filter_condition_modes():
    anyc = health.filter_cohort(DF, conditions=["copd", "ckd"], condition_mode="any")
    allc = health.filter_cohort(DF, conditions=["copd", "ckd"], condition_mode="all")
    assert (anyc["copd"] | anyc["ckd"]).all()
    assert (allc["copd"] & allc["ckd"]).all()
    assert len(allc) < len(anyc)


def test_drivers_sum_to_the_score():
    pid = health.patient_list(DF)["rows"][0]["id"]
    d = health.patient_detail(DF, pid)
    import math
    z = d["intercept"] + sum(x["logit"] for x in d["drivers"])
    assert abs(100 / (1 + math.exp(-z)) - d["risk"]) < 0.2
    assert d["timeline"][-1]["date"] == health.TODAY.isoformat()


def test_doing_nothing_changes_nothing():
    s = health.simulate(DF)
    assert s["avoided"] == 0 and s["program_cost"] == 0 and s["roi"] is None


def test_every_lever_reduces_readmissions():
    for kw in [{"hba1c_drop": 1}, {"sbp_drop": 10}, {"smoking_quit_pct": 50}, {"enroll_pct": 10}]:
        assert health.simulate(DF, **kw)["avoided"] > 0, kw


def test_news2_thresholds():
    calm = monitor.news2(hr=75, rr=16, spo2=97, sbp=125, temp=37.0, oxygen=False, conscious="A")
    assert calm["score"] == 0 and calm["level"] == "low"
    single3 = monitor.news2(hr=75, rr=16, spo2=91, sbp=125, temp=37.0, oxygen=False, conscious="A")
    assert single3["score"] == 3 and single3["level"] == "low-medium"
    shock = monitor.news2(hr=135, rr=26, spo2=88, sbp=85, temp=39.4, oxygen=True, conscious="C")
    assert shock["score"] == 3 + 3 + 2 + 3 + 3 + 3 + 2
    assert shock["level"] == "high"


def test_a_deteriorating_bed_escalates_and_recovers():
    import numpy as np
    rng = np.random.default_rng(0)
    ward = monitor.new_ward(seed=1)
    ward[0].deteriorating = True
    for _ in range(40):
        snap = monitor.step(ward, rng)
    assert snap[0]["level"] == "high"
    ward[0].deteriorating = False
    for _ in range(60):
        snap = monitor.step(ward, rng)
    assert snap[0]["score"] < 5
