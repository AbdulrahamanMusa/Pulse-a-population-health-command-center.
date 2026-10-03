import pytest
from shiny.testserver import TestServerSession

pytestmark = pytest.mark.parametrize("local_server", ["../app.py"], indirect=True)

def out(session: TestServerSession, name: str):
    """Read an output, re-flushing while it is still settling.

    The test server's flush wait can occasionally return before the first
    render of a freshly started session lands; a few re-reads absorb that.
    """
    for _ in range(50):
        o = session.get_output(name)
        if o.status == "ok":
            return o.value
        session.flush()
    raise AssertionError(f"output {name!r} never settled: {o.status}")


DEFAULTS = dict(
    age_range=[18, 100],
    sexes=[],
    regions=[],
    conditions=[],
    condition_mode="any",
    clean_data=False,
    search="",
    monitor_running=False,
)


def test_filters_shrink_the_cohort(local_server: TestServerSession):
    local_server.set_inputs(**DEFAULTS)
    everyone = out(local_server, "kpis")
    assert everyone["patients"] == everyone["population"]["patients"]
    local_server.set_inputs(conditions=["heart_failure"], age_range=[65, 100])
    hf = out(local_server, "kpis")
    assert 0 < hf["patients"] < everyone["patients"]
    assert hf["mean_risk"] > everyone["mean_risk"]


def test_cleaning_toggle_drops_duplicates(local_server: TestServerSession):
    local_server.set_inputs(**DEFAULTS)
    raw = out(local_server, "patients")["total"]
    local_server.set_inputs(clean_data=True)
    assert out(local_server, "patients")["total"] == raw  # list is already deduped
    q = out(local_server, "quality")
    assert q["clean"]["duplicates"] == 0 < q["raw"]["duplicates"]


def test_search_and_patient_chart(local_server: TestServerSession):
    local_server.set_inputs(**{**DEFAULTS, "search": "P00042"})
    rows = out(local_server, "patients")["rows"]
    assert [r["id"] for r in rows] == ["P00042"]
    local_server.set_inputs(selected_patient="P00042")
    d = out(local_server, "patient_detail")
    assert d["id"] == "P00042" and len(d["timeline"]) == 10


def test_simulation_responds_to_levers(local_server: TestServerSession):
    local_server.set_inputs(**DEFAULTS, sim={"hba1c": 0, "sbp": 0, "smoking": 0, "enroll": 0})
    assert out(local_server, "simulation")["avoided"] == 0
    local_server.set_inputs(sim={"hba1c": 1, "sbp": 10, "smoking": 30, "enroll": 10})
    s = out(local_server, "simulation")
    assert s["avoided"] > 0 and s["enrolled"] > 0
