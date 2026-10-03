import { Cigarette, Droplet, HeartPulse, PiggyBank, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { C, Card, axisProps, fmt, tooltipProps } from "@/components/common";
import { useShinyInput, useShinyOutputStatus, useShinyOutputValue } from "@/shiny";
import type { SimInput, Simulation } from "@/types";

const PRESETS: { name: string; v: SimInput }[] = [
  { name: "Do nothing", v: { hba1c: 0, sbp: 0, smoking: 0, enroll: 0 } },
  { name: "Diabetes push", v: { hba1c: 1.2, sbp: 0, smoking: 0, enroll: 5 } },
  { name: "Cardio-metabolic", v: { hba1c: 0.8, sbp: 12, smoking: 25, enroll: 8 } },
  { name: "Moonshot", v: { hba1c: 1.8, sbp: 20, smoking: 60, enroll: 20 } },
];

function Slider({
  icon,
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  hint: string;
}) {
  return (
    <div className="slider">
      <div className="row-between">
        <label>
          {icon} {label}
        </label>
        <b className="slider-val">
          {value}
          {unit}
        </b>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <p className="muted tiny">{hint}</p>
    </div>
  );
}

function Big({ label, value, tone, sub }: { label: string; value: ReactNode; tone: string; sub?: ReactNode }) {
  return (
    <div className="big-stat" style={{ "--tone": tone } as React.CSSProperties}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function Simulator() {
  const [sim, setSim] = useShinyInput<SimInput>("sim", PRESETS[2].v, { debounceMs: 150 });
  const s = useShinyOutputValue<Simulation>("simulation");
  const status = useShinyOutputStatus("simulation");
  const set = (k: keyof SimInput) => (v: number) => setSim({ ...sim, [k]: v });

  return (
    <div className="view sim">
      <Card title="Intervention levers" subtitle="Applied to the active cohort" className="levers">
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.name} className={`chip ${JSON.stringify(p.v) === JSON.stringify(sim) ? "on" : ""}`} onClick={() => setSim(p.v)}>
              {p.name}
            </button>
          ))}
        </div>
        <Slider icon={<Droplet size={14} />} label="HbA1c reduction (diabetics)" value={sim.hba1c} min={0} max={2} step={0.1} unit=" pts" onChange={set("hba1c")} hint="Floor at 5.7%. Typical intensive programs achieve 0.5–1.5." />
        <Slider icon={<HeartPulse size={14} />} label="Systolic BP reduction (hypertensives)" value={sim.sbp} min={0} max={25} step={1} unit=" mmHg" onChange={set("sbp")} hint="Floor at 110 mmHg. Pharmacist-led titration: ~10." />
        <Slider icon={<Cigarette size={14} />} label="Smokers who quit" value={sim.smoking} min={0} max={100} step={5} unit="%" onChange={set("smoking")} hint="Cessation programs reach 15–30% at one year." />
        <Slider icon={<Users size={14} />} label="Enrol highest-risk in care coordination" value={sim.enroll} min={0} max={30} step={1} unit="%" onChange={set("enroll")} hint="22% relative risk reduction, $650 per enrollee per year." />
      </Card>

      <div className={`sim-results ${status === "recalculating" ? "recalculating" : ""}`}>
        {!s ? (
          <div className="card skeleton tall" />
        ) : (
          <>
            <div className="big-stats">
              <Big label="Readmissions avoided / yr" value={s.avoided.toFixed(1)} tone={C.accent} sub={`${s.baseline_events} → ${s.scenario_events}`} />
              <Big label="Gross savings" value={fmt.usd(s.savings)} tone={C.green} sub={`program cost ${fmt.usd(s.program_cost)}`} />
              <Big label="Net impact" value={fmt.usd(s.net)} tone={s.net >= 0 ? C.green : C.red} sub={s.roi != null ? `ROI ${(s.roi * 100).toFixed(0)}%` : "no program spend"} />
              <Big label="Number needed to enrol" value={s.nnt ?? "–"} tone={C.violet} sub={`${fmt.int(s.enrolled)} enrolled · ${fmt.int(s.quitters)} quit smoking`} />
            </div>
            <Card title="Risk curve shift" subtitle="Patients per risk bin, baseline vs scenario">
              <div className="chart-240">
                <ResponsiveContainer>
                  <AreaChart data={s.histogram}>
                    <defs>
                      <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor={C.red} stopOpacity={0.45} />
                        <stop offset="1" stopColor={C.red} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor={C.accent} stopOpacity={0.5} />
                        <stop offset="1" stopColor={C.accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="label" {...axisProps} interval={3} />
                    <YAxis {...axisProps} width={44} />
                    <Tooltip {...tooltipProps} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="baseline" name="Baseline" stroke={C.red} fill="url(#gb)" strokeWidth={2} />
                    <Area type="monotone" dataKey="scenario" name="Scenario" stroke={C.accent} fill="url(#gs)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Tier migration">
              <div className="chart-200">
                <ResponsiveContainer>
                  <BarChart data={s.tiers} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid stroke={C.grid} horizontal={false} />
                    <XAxis type="number" {...axisProps} />
                    <YAxis type="category" dataKey="tier" {...axisProps} width={72} />
                    <Tooltip {...tooltipProps} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="baseline" name="Baseline" fill="#475569" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="scenario" name="Scenario" fill={C.accent} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="muted tiny">
                <PiggyBank size={12} /> Assumes ${"15,200"} per avoided readmission. Model is illustrative, not validated.
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
