# Pulse: Health Command Center

A population-health and ICU command center built with **Shiny for Python + shinyreact**.
The Python server holds only reactive computation and returns JSON. The whole UI is a
React client (`src/`) built to `www/ui.js`.

> All patient data is synthetic and generated at startup. The risk model is illustrative, not clinically validated.

## What's in it

| Tab | What it does | shinyreact feature |
|---|---|---|
| **Population** | KPI tiles with deltas vs. the whole population, risk distribution by tier, risk by age × sex, regional cost, condition prevalence, and an interactive comorbidity "lift" heatmap | `useShinyInput` filters → one shared `@reactive.calc` cohort → one `reactive_output` per card |
| **Patients** | Search ~3,000 patients, open a chart: risk gauge, **explainable risk drivers** (log-odds per factor), 24-month HbA1c/BP trajectory, encounters and medications | input-driven detail output, `useShinyOutputStatus` dimming |
| **ICU Live** | 8 beds of streaming telemetry with bedside-style **ECG / pleth / respiration sweeps**, live **NEWS2** early-warning scores, an escalation log, alarm sounds, "Simulate deterioration" and "Sepsis bundle" actions | `send_message` push every second + `reactive.invalidate_later`, `useShinyMessageHandler`, event inputs |
| **What-if** | Intervention levers (HbA1c, BP, smoking cessation, care-coordination enrolment) → readmissions avoided, savings, ROI, number needed to enrol, risk-curve shift and tier migration | object-valued input (`sim`) |
| **Data quality** | Completeness rings, per-field missing/out-of-range profile, duplicate and stale-record counts, and a cleaning pipeline you can toggle to see analytics before and after | the same `clean_data` input mounted in two places shares state |

ICU escalations reach you on **every tab**: toasts, a pulsing header chip, and a tab badge.
The sidebar also exports the active cohort as a CSV, delivered over `send_message`.

## Run it

```bash
pip install -r requirements.txt
shiny run app.py            # http://127.0.0.1:8000
```

`www/ui.js` is already built. To change the UI:

```bash
npm install
npm run build               # or: npm run dev  (rebuild on save), then reload the page
```

## Deploy (Render)

`render.yaml` describes the service. In the Render dashboard choose **New → Blueprint**,
connect this repository, and apply. Render installs `requirements.txt` and runs
`shiny run app.py --host 0.0.0.0 --port $PORT`. On the free plan the service sleeps after
15 minutes without traffic, so the first visit after a pause takes about a minute.

## Layout

```
app.py          Shiny server: reactive outputs, effects, telemetry loop
health.py       registry generation, cleaning, cohort analytics, risk model, simulator (pure)
monitor.py      ICU vitals simulation + NEWS2 scoring (pure)
src/            React client (TypeScript): App.tsx, components/, styles.css
www/ui.js/css   build output served by set_react_page()
tests/          pytest: pure logic + the reactive graph via the local_server fixture
```

## Tests

```bash
pip install pytest
pytest
```
