import { Ambulance, CalendarClock, Cigarette, Pill, Search, Stethoscope, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { C, Card, Empty, TIER_COLOR, TierBadge, axisProps, fmt, tooltipProps } from "@/components/common";
import { useShinyInput, useShinyOutputStatus, useShinyOutputValue } from "@/shiny";
import type { PatientDetail, PatientList } from "@/types";

function RiskGauge({ risk, color }: { risk: number; color: string }) {
  // Semicircle gauge, 0–60% mapped onto 180°.
  const r = 70;
  const frac = Math.min(risk / 60, 1);
  const angle = Math.PI * (1 - frac);
  const x = 90 + r * Math.cos(angle);
  const y = 90 - r * Math.sin(angle);
  return (
    <svg viewBox="0 0 180 104" className="gauge" role="img" aria-label={`Risk ${risk}%`}>
      <path d="M20 90 A70 70 0 0 1 160 90" stroke="#1e293b" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d={`M20 90 A70 70 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`} stroke={color} strokeWidth="14" fill="none" strokeLinecap="round" />
      <text x="90" y="82" textAnchor="middle" className="gauge-val">
        {risk.toFixed(1)}%
      </text>
      <text x="90" y="100" textAnchor="middle" className="gauge-sub">
        30-day readmission
      </text>
    </svg>
  );
}

function Drivers({ d }: { d: PatientDetail }) {
  const max = Math.max(0.5, ...d.drivers.map((x) => Math.abs(x.logit)));
  return (
    <div className="drivers">
      {d.drivers.map((x) => (
        <div key={x.driver} className="driver">
          <span className="driver-name">{x.driver}</span>
          <div className="driver-track">
            <div className="driver-zero" />
            <div
              className={`driver-bar ${x.logit >= 0 ? "up" : "down"}`}
              style={
                x.logit >= 0
                  ? { left: "50%", width: `${(50 * x.logit) / max}%` }
                  : { right: "50%", width: `${(50 * -x.logit) / max}%` }
              }
            />
          </div>
          <span className={`driver-val ${x.logit >= 0 ? "up" : "down"}`}>
            {x.logit >= 0 ? "+" : "−"}
            {Math.abs(x.logit).toFixed(2)}
          </span>
        </div>
      ))}
      <p className="muted tiny">Log-odds contribution of each factor on top of a baseline of {d.intercept}.</p>
    </div>
  );
}

const VITAL_META: Record<string, { label: string; unit: string; bad: (v: number) => boolean }> = {
  hba1c: { label: "HbA1c", unit: "%", bad: (v) => v >= 8 },
  sbp: { label: "Systolic BP", unit: "mmHg", bad: (v) => v >= 140 },
  dbp: { label: "Diastolic BP", unit: "mmHg", bad: (v) => v >= 90 },
  bmi: { label: "BMI", unit: "", bad: (v) => v >= 35 },
  ldl: { label: "LDL", unit: "mg/dL", bad: (v) => v >= 160 },
  egfr: { label: "eGFR", unit: "", bad: (v) => v < 45 },
};

const EVENT_ICON: Record<string, ReactNode> = {
  Admission: <Stethoscope size={14} />,
  "ED visit": <Ambulance size={14} />,
  Medication: <Pill size={14} />,
};

function Detail() {
  const d = useShinyOutputValue<PatientDetail | null>("patient_detail", null);
  const status = useShinyOutputStatus("patient_detail");
  if (!d) return <Empty>Select a patient to open their chart.</Empty>;
  const color = TIER_COLOR[d.tier];
  return (
    <div className={`detail ${status === "recalculating" ? "recalculating" : ""}`}>
      <div className="detail-head">
        <div className="avatar" style={{ background: color }}>
          {d.name
            .split(" ")
            .map((s) => s[0])
            .join("")}
        </div>
        <div>
          <h2>{d.name}</h2>
          <p className="muted">
            {d.id} · {d.age} y · {d.sex} · {d.region} · {d.insurance}
          </p>
          <div className="tags">
            <TierBadge tier={d.tier} />
            {d.conditions.map((c) => (
              <span key={c} className="tag">
                {c}
              </span>
            ))}
            {d.smoker && (
              <span className="tag warn">
                <Cigarette size={12} /> Smoker
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <Card title="Readmission risk">
          <RiskGauge risk={d.risk} color={color} />
          <div className="util">
            <div>
              <b>{d.utilization.admissions_12m}</b>
              <span>admissions</span>
            </div>
            <div>
              <b>{d.utilization.ed_visits_12m}</b>
              <span>ED visits</span>
            </div>
            <div>
              <b>{fmt.usd(d.utilization.cost_12m)}</b>
              <span>12-mo cost</span>
            </div>
          </div>
        </Card>
        <Card title="Why this score?" subtitle="Explainable risk drivers">
          <Drivers d={d} />
        </Card>
      </div>

      <div className="vitals">
        {Object.entries(VITAL_META).map(([k, m]) => {
          const v = d.vitals[k as keyof PatientDetail["vitals"]];
          return (
            <div key={k} className={`vital ${v != null && m.bad(v) ? "bad" : ""} ${v == null ? "missing" : ""}`}>
              <span>{m.label}</span>
              <b>{v == null ? "missing" : v}</b>
              <small>{v == null ? "no result on file" : m.unit}</small>
            </div>
          );
        })}
      </div>

      <Card title="24-month trajectory" subtitle="HbA1c (left) and systolic BP (right)">
        <div className="chart-220">
          <ResponsiveContainer>
            <LineChart data={d.timeline}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="date" {...axisProps} tickFormatter={(s: string) => s.slice(0, 7)} />
              <YAxis yAxisId="a" {...axisProps} width={36} domain={["auto", "auto"]} />
              <YAxis yAxisId="b" orientation="right" {...axisProps} width={40} domain={["auto", "auto"]} />
              <ReferenceLine yAxisId="a" y={8} stroke={C.accent} strokeDasharray="4 4" />
              <ReferenceLine yAxisId="b" y={140} stroke={C.pink} strokeDasharray="4 4" />
              <Tooltip {...tooltipProps} />
              <Line yAxisId="a" type="monotone" dataKey="hba1c" name="HbA1c %" stroke={C.accent} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line yAxisId="b" type="monotone" dataKey="sbp" name="SBP mmHg" stroke={C.pink} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Encounters & medications">
        <ol className="events">
          {d.events.map((e, i) => (
            <li key={i} className={`event ${e.kind.replace(/\s/g, "-").toLowerCase()}`}>
              <span className="event-icon">{EVENT_ICON[e.kind] ?? <CalendarClock size={14} />}</span>
              <span className="event-kind">{e.kind}</span>
              <span className="event-detail">{e.detail}</span>
              <time>{e.date}</time>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

export function Patients() {
  const [search, setSearch] = useShinyInput<string>("search", "", { debounceMs: 200 });
  const [selected, setSelected] = useShinyInput<string | null>("selected_patient", null, { debounceMs: 0 });
  const list = useShinyOutputValue<PatientList>("patients");
  const status = useShinyOutputStatus("patients");

  // Open the riskiest patient's chart the first time the list arrives.
  useEffect(() => {
    if (!selected && list?.rows.length) setSelected(list.rows[0].id);
  }, [list, selected]);

  return (
    <div className="view patients">
      <div className="card plist">
        <div className="search">
          <Search size={15} />
          <input placeholder="Search name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <p className="muted small plist-count">
          {list ? `${list.total.toLocaleString()} matches · top ${list.rows.length} by risk` : "Loading…"}
        </p>
        <ul className={status === "recalculating" ? "recalculating" : ""}>
          {(list?.rows ?? []).map((p) => (
            <li key={p.id}>
              <button className={`prow ${selected === p.id ? "on" : ""}`} onClick={() => setSelected(p.id)}>
                <span className="prow-risk" style={{ color: TIER_COLOR[p.tier] }}>
                  {p.risk.toFixed(0)}
                  <small>%</small>
                </span>
                <span className="prow-main">
                  <b>{p.name}</b>
                  <span className="muted small">
                    {p.id} · {p.age}
                    {p.sex[0]} · {p.conditions.slice(0, 2).join(", ") || "no chronic conditions"}
                    {p.conditions.length > 2 ? ` +${p.conditions.length - 2}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {list && list.rows.length === 0 && (
            <Empty>
              <UserRound size={18} /> No patients match.
            </Empty>
          )}
        </ul>
      </div>
      <Detail />
    </div>
  );
}
