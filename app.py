"""Pulse: a population-health command center.

The server holds only reactive computation and returns JSON; the whole UI is
the React client in src/ (built to www/ui.js). All patient data is synthetic.
"""

from datetime import datetime

import numpy as np
from shiny import reactive
from shiny.express import input, session
from shinyreact import reactive_output, send_message, set_react_page

import health
import monitor

set_react_page()


# --------------------------------------------------------------------------
# Registry and cohort
# --------------------------------------------------------------------------

@reactive.calc
def registry():
    if input.clean_data():
        return health.load_clean_registry()[0]
    return health.load_registry()


@reactive.calc
def cohort():
    return health.filter_cohort(
        registry(),
        age_range=input.age_range(),
        sexes=input.sexes(),
        regions=input.regions(),
        conditions=input.conditions(),
        condition_mode=input.condition_mode(),
    )


@reactive_output
def kpis():
    out = health.kpis(cohort().drop_duplicates("patient_id"))
    out["population"] = health.kpis(registry().drop_duplicates("patient_id"))
    return out


@reactive_output
def risk_hist():
    return health.risk_histogram(cohort().drop_duplicates("patient_id")["risk"])


@reactive_output
def breakdown():
    return health.breakdown(cohort().drop_duplicates("patient_id"))


@reactive_output
def comorbidity():
    return health.comorbidity(cohort().drop_duplicates("patient_id"))


@reactive_output
def patients():
    return health.patient_list(cohort(), input.search())


@reactive_output
def patient_detail():
    pid = input.selected_patient()
    return health.patient_detail(registry(), pid) if pid else None


@reactive_output
def simulation():
    s = input.sim()
    return health.simulate(
        cohort(),
        hba1c_drop=float(s["hba1c"]),
        sbp_drop=float(s["sbp"]),
        smoking_quit_pct=float(s["smoking"]),
        enroll_pct=float(s["enroll"]),
    )


@reactive_output
def quality():
    raw = health.data_quality(health.load_registry())
    clean_df, log = health.load_clean_registry()
    return {"raw": raw, "clean": health.data_quality(clean_df), "log": log}


@reactive.effect
@reactive.event(input.clean_data, ignore_init=True)
async def _announce_cleaning():
    if input.clean_data():
        log = health.load_clean_registry()[1]
        text = (
            f"Removed {log['duplicates_removed']} duplicates, nulled "
            f"{log['out_of_range_nulled']} implausible values, imputed "
            f"{log['values_imputed']} missing values."
        )
        await send_message(session, "toast", {"title": "Cleaning rules applied", "text": text, "level": "ok"})
    else:
        await send_message(session, "toast", {"title": "Showing raw registry", "text": "Data-quality defects are back in the analytics.", "level": "info"})


@reactive.effect
@reactive.event(input.export, ignore_init=True)
async def _export():
    if not input.export():
        return
    df = cohort()
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    await send_message(
        session,
        "download",
        {"filename": f"pulse-cohort-{stamp}.csv", "csv": health.cohort_csv(df)},
    )
    await send_message(session, "toast", {"title": "Cohort exported", "text": f"{df['patient_id'].nunique():,} patients written to CSV.", "level": "ok"})


# --------------------------------------------------------------------------
# ICU live telemetry (state is per session: app.py runs once per session)
# --------------------------------------------------------------------------

ward = monitor.new_ward(seed=11)
rng = np.random.default_rng()


@reactive.effect
async def _telemetry():
    if not input.monitor_running():
        return
    reactive.invalidate_later(1.0)
    snap = monitor.step(ward, rng)
    await send_message(session, "vitals", {"t": datetime.now().strftime("%H:%M:%S"), "beds": snap})
    for bed, s in zip(ward, snap):
        if monitor.LEVEL_RANK[s["level"]] > monitor.LEVEL_RANK[bed.level] and s["level"] in ("medium", "high"):
            await send_message(
                session,
                "alert",
                {
                    "bed": s["id"],
                    "patient": s["patient"],
                    "score": s["score"],
                    "level": s["level"],
                    "t": datetime.now().strftime("%H:%M:%S"),
                },
            )
        bed.level = s["level"]


@reactive.effect
@reactive.event(input.deteriorate, ignore_init=True)
async def _deteriorate():
    if not input.deteriorate():
        return
    stable = [b for b in ward if not b.deteriorating and b.severity < 0.1]
    if not stable:
        return
    bed = stable[int(rng.integers(len(stable)))]
    bed.deteriorating = True
    await send_message(session, "toast", {"title": f"{bed.id} is deteriorating", "text": f"{bed.patient}: watch the NEWS2 score climb.", "level": "warn"})


@reactive.effect
@reactive.event(input.treat_bed, ignore_init=True)
async def _treat():
    req = input.treat_bed()
    if not req:
        return
    for bed in ward:
        if bed.id == req["bed"]:
            bed.deteriorating = False
            bed.oxygen = True
            await send_message(session, "toast", {"title": f"Sepsis bundle started on {bed.id}", "text": "Fluids, antibiotics and oxygen given. Vitals should recover.", "level": "ok"})
