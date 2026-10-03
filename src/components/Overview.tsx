import { Activity, AlertTriangle, BedDouble, DollarSign, Droplet, HeartPulse, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { C, Card, TIER_COLOR, axisProps, fmt, tooltipProps } from "@/components/common";
import { useShinyOutputValue } from "@/shiny";
import type { Breakdown, Comorbidity, HistBin, Kpis, Tier } from "@/types";

function Delta({ value, base, invert = false, unit = "" }: { value: number | null; base: number | null; invert?: boolean; unit?: string }) {
  if (value == null || base == null) return null;
  const d = value - base;
  if (Math.abs(d) < 0.05) return <span className="delta flat">≈ population</span>;
  const good = invert ? d < 0 : d > 0;
  return (
    <span className={`delta ${good ? "good" : "bad"}`}>
      {d > 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1)}
      {unit} vs pop.
    </span>
  );
}

function Stat({ icon, label, value, children, tone }: { icon: ReactNode; label: string; value: ReactNode; children?: ReactNode; tone?: string }) {
  return (
    <div className="stat" style={tone ? ({ "--tone": tone } as React.CSSProperties) : undefined}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">{children}</div>
    </div>
  );
}

function KpiRow() {
  const k = useShinyOutputValue<Kpis>("kpis");
  if (!k) return <div className="stats">{Array.from({ length: 6 }, (_, i) => <div key={i} className="stat skeleton" />)}</div>;
  const p = k.population;
  return (
    <div className="stats">
      <Stat icon={<Users size={16} />} label="Patients in cohort" value={fmt.int(k.patients)} tone={C.blue}>
        mean age {k.mean_age ?? "–"}
      </Stat>
      <Stat icon={<Activity size={16} />} label="Mean 30-day readmission risk" value={fmt.pct(k.mean_risk)} tone={C.accent}>
        <Delta value={k.mean_risk} base={p.mean_risk} invert unit="pt" />
      </Stat>
      <Stat icon={<AlertTriangle size={16} />} label="High / very-high risk" value={fmt.int(k.high_risk)} tone={C.red}>
        {k.patients ? fmt.pct((100 * k.high_risk) / k.patients) : "–"} of cohort
      </Stat>
      <Stat icon={<BedDouble size={16} />} label="Observed readmission rate" value={fmt.pct(k.readmit_rate)} tone={C.violet}>
        <Delta value={k.readmit_rate} base={p.readmit_rate} invert unit="pt" />
      </Stat>
      <Stat icon={<DollarSign size={16} />} label="Cost per patient (12 mo)" value={fmt.usd(k.cost_per_patient)} tone={C.amber}>
        {fmt.usd(k.total_cost)} total
      </Stat>
      <Stat icon={<HeartPulse size={16} />} label="BP controlled (<140)" value={fmt.pct(k.bp_controlled)} tone={C.pink}>
        <span className="inline-meter">
          <Droplet size={12} /> A1c &lt;8%: {fmt.pct(k.a1c_controlled)}
        </span>
      </Stat>
    </div>
  );
}

function TierStack({ tiers }: { tiers: Record<Tier, number> }) {
  const total = Object.values(tiers).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="tier-stack">
      <div className="tier-bar">
        {(Object.keys(tiers) as Tier[]).map((t) => (
          <div key={t} title={`${t}: ${tiers[t]}`} style={{ flex: tiers[t], background: TIER_COLOR[t] }} />
        ))}
      </div>
      <div className="tier-legend">
        {(Object.keys(tiers) as Tier[]).map((t) => (
          <span key={t}>
            <i style={{ background: TIER_COLOR[t] }} />
            {t} <b>{fmt.pct((100 * tiers[t]) / total, 0)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function RiskHistogram() {
  const bins = useShinyOutputValue<HistBin[]>("risk_hist");
  const k = useShinyOutputValue<Kpis>("kpis");
  return (
    <Card title="Risk distribution" subtitle="Predicted 30-day readmission probability, colored by tier" output="risk_hist" ready={!!bins} className="span-2">
      {k && <TierStack tiers={k.tiers} />}
      <div className="chart-260">
        <ResponsiveContainer>
          <BarChart data={bins ?? []} barCategoryGap={1}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="label" {...axisProps} interval={3} />
            <YAxis {...axisProps} width={44} />
            <Tooltip {...tooltipProps} formatter={(v) => [v, "patients"]} labelFormatter={(l) => `Risk ≥ ${l}`} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {(bins ?? []).map((b) => (
                <Cell key={b.label} fill={TIER_COLOR[b.tier]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function AgeSex() {
  const b = useShinyOutputValue<Breakdown>("breakdown");
  return (
    <Card title="Risk by age & sex" subtitle="Mean predicted risk, %" output="breakdown" ready={!!b}>
      <div className="chart-260">
        <ResponsiveContainer>
          <BarChart data={b?.age_sex ?? []}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="band" {...axisProps} />
            <YAxis {...axisProps} width={36} unit="%" />
            <Tooltip {...tooltipProps} formatter={(v) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 12, color: C.text }} />
            <Bar dataKey="Female" fill={C.violet} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Male" fill={C.blue} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Regions() {
  const b = useShinyOutputValue<Breakdown>("breakdown");
  const max = Math.max(1, ...(b?.region ?? []).map((r) => r.cost_per_patient));
  return (
    <Card title="Regional view" subtitle="Patients, risk and cost per patient" output="breakdown" ready={!!b}>
      <div className="region-list">
        {(b?.region ?? []).map((r) => (
          <div key={r.region} className="region-row">
            <div className="region-name">{r.region}</div>
            <div className="region-bar">
              <div style={{ width: `${(100 * r.cost_per_patient) / max}%` }} />
              <span>{fmt.usd(r.cost_per_patient)}</span>
            </div>
            <div className="region-meta">
              <b>{fmt.int(r.patients)}</b> pts · {fmt.pct(r.mean_risk)}
            </div>
          </div>
        ))}
      </div>
      <h4 className="mini-title">Condition prevalence</h4>
      <div className="prevalence">
        {(b?.prevalence ?? []).map((p) => (
          <div key={p.key} className="prev-row">
            <span>{p.condition}</span>
            <div className="prev-bar">
              <div style={{ width: `${p.pct}%` }} />
            </div>
            <b>{fmt.pct(p.pct, 0)}</b>
          </div>
        ))}
      </div>
    </Card>
  );
}

function liftColor(lift: number | null) {
  if (lift == null) return "transparent";
  // Diverging around 1: blue = less often together than chance, rose = more.
  const t = Math.max(-1, Math.min(1, Math.log2(lift) / 1.5));
  return t >= 0 ? `rgba(244, 63, 94, ${0.12 + 0.75 * t})` : `rgba(96, 165, 250, ${0.12 + 0.75 * -t})`;
}

function ComorbidityMatrix() {
  const m = useShinyOutputValue<Comorbidity>("comorbidity");
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const n = m?.labels.length ?? 0;
  const cell = (i: number, j: number) => m!.cells[i * n + j];
  const h = hover && m ? cell(hover.i, hover.j) : null;
  return (
    <Card title="Comorbidity web" subtitle="Lift = observed co-occurrence ÷ expected by chance" output="comorbidity" ready={!!m} className="span-2">
      {m && (
        <div className="como">
          <div className="como-grid" style={{ gridTemplateColumns: `120px repeat(${n}, 1fr)` }} onMouseLeave={() => setHover(null)}>
            <div />
            {m.labels.map((l, j) => (
              <div key={l} className={`como-col ${hover?.j === j ? "hl" : ""}`}>
                {l}
              </div>
            ))}
            {m.labels.map((li, i) => (
              <div key={li} className="como-rowwrap">
                <div className={`como-row ${hover?.i === i ? "hl" : ""}`}>{li}</div>
                {m.labels.map((_, j) => {
                  const c = cell(i, j);
                  return (
                    <div
                      key={j}
                      className={`como-cell ${i === j ? "diag" : ""}`}
                      style={{ background: i === j ? undefined : liftColor(c.lift) }}
                      onMouseEnter={() => setHover({ i, j })}
                    >
                      {i === j ? c.count : c.lift?.toFixed(1)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="como-side">
            <div className="como-readout">
              {h && hover ? (
                hover.i === hover.j ? (
                  <>
                    <b>{m.labels[hover.i]}</b>
                    <div className="big">{fmt.int(h.count)}</div>
                    <span className="muted">patients</span>
                  </>
                ) : (
                  <>
                    <b>
                      {m.labels[hover.i]} + {m.labels[hover.j]}
                    </b>
                    <div className="big">{h.lift?.toFixed(2)}×</div>
                    <span className="muted">{fmt.int(h.count)} patients have both</span>
                  </>
                )
              ) : (
                <span className="muted">Hover a cell to read it.</span>
              )}
            </div>
            <h4 className="mini-title">Multimorbidity</h4>
            <div className="chart-160">
              <ResponsiveContainer>
                <BarChart data={m.multimorbidity}>
                  <XAxis dataKey="conditions" {...axisProps} />
                  <YAxis hide />
                  <Tooltip {...tooltipProps} formatter={(v) => [v, "patients"]} labelFormatter={(l) => `${l} conditions`} />
                  <Bar dataKey="patients" fill={C.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export function Overview() {
  return (
    <div className="view">
      <KpiRow />
      <div className="grid-3">
        <RiskHistogram />
        <AgeSex />
        <ComorbidityMatrix />
        <Regions />
      </div>
    </div>
  );
}
