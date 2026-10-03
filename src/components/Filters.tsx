import { Download, Filter, Sparkles } from "lucide-react";

import { useShinyInput, useShinyOutputValue } from "@/shiny";
import type { Kpis } from "@/types";

const SEXES = ["Female", "Male"];
const REGIONS = ["North", "South", "East", "West", "Central"];
const CONDITIONS: [string, string][] = [
  ["diabetes", "Diabetes"],
  ["hypertension", "Hypertension"],
  ["copd", "COPD"],
  ["heart_failure", "Heart failure"],
  ["ckd", "CKD"],
  ["asthma", "Asthma"],
  ["depression", "Depression"],
];
const AGE_MIN = 18;
const AGE_MAX = 100;

function toggle(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function Chips({ options, value, onChange }: { options: [string, string][]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={`chip ${value.includes(key) ? "on" : ""}`}
          aria-pressed={value.includes(key)}
          onClick={() => onChange(toggle(value, key))}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function AgeRange({ value, onChange }: { value: [number, number]; onChange: (v: [number, number]) => void }) {
  const [lo, hi] = value;
  const pct = (v: number) => ((v - AGE_MIN) / (AGE_MAX - AGE_MIN)) * 100;
  return (
    <div className="range2">
      <div className="range2-track">
        <div className="range2-fill" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
      </div>
      <input
        type="range"
        aria-label="Minimum age"
        min={AGE_MIN}
        max={AGE_MAX}
        value={lo}
        onChange={(e) => onChange([Math.min(Number(e.target.value), hi - 1), hi])}
      />
      <input
        type="range"
        aria-label="Maximum age"
        min={AGE_MIN}
        max={AGE_MAX}
        value={hi}
        onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo + 1)])}
      />
    </div>
  );
}

export function Filters() {
  const [age, setAge] = useShinyInput<[number, number]>("age_range", [AGE_MIN, AGE_MAX], { debounceMs: 250 });
  const [sexes, setSexes] = useShinyInput<string[]>("sexes", []);
  const [regions, setRegions] = useShinyInput<string[]>("regions", []);
  const [conditions, setConditions] = useShinyInput<string[]>("conditions", []);
  const [mode, setMode] = useShinyInput<"any" | "all">("condition_mode", "any");
  const [clean, setClean] = useShinyInput<boolean>("clean_data", false);
  const [exportCount, setExport] = useShinyInput<number>("export", 0, { debounceMs: 0, priority: "event" });
  const kpis = useShinyOutputValue<Kpis>("kpis");

  const active = (age[0] > AGE_MIN || age[1] < AGE_MAX ? 1 : 0) + sexes.length + regions.length + conditions.length;
  const share = kpis ? (100 * kpis.patients) / Math.max(1, kpis.population.patients) : 0;

  const reset = () => {
    setAge([AGE_MIN, AGE_MAX]);
    setSexes([]);
    setRegions([]);
    setConditions([]);
    setMode("any");
  };

  return (
    <aside className="sidebar">
      <div className="cohort-meter">
        <div className="row-between">
          <span className="eyebrow">
            <Filter size={13} /> Active cohort
          </span>
          {active > 0 && (
            <button className="link" onClick={reset}>
              Reset ({active})
            </button>
          )}
        </div>
        <div className="cohort-count">
          {kpis ? kpis.patients.toLocaleString() : "–"}
          <span className="muted"> / {kpis ? kpis.population.patients.toLocaleString() : "–"}</span>
        </div>
        <div className="meter">
          <div style={{ width: `${share}%` }} />
        </div>
      </div>

      <div className="field">
        <label>
          Age <span className="muted">{age[0]}–{age[1] >= AGE_MAX ? `${AGE_MAX}+` : age[1]}</span>
        </label>
        <AgeRange value={age} onChange={setAge} />
      </div>

      <div className="field">
        <label>Sex</label>
        <Chips options={SEXES.map((s) => [s, s])} value={sexes} onChange={setSexes} />
      </div>

      <div className="field">
        <label>Region</label>
        <Chips options={REGIONS.map((s) => [s, s])} value={regions} onChange={setRegions} />
      </div>

      <div className="field">
        <div className="row-between">
          <label>Conditions</label>
          <div className="segmented" role="group" aria-label="Condition match">
            {(["any", "all"] as const).map((m) => (
              <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <Chips options={CONDITIONS} value={conditions} onChange={setConditions} />
      </div>

      <div className="field">
        <label className="switch">
          <input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} />
          <span className="switch-ui" />
          <span>
            <Sparkles size={13} /> Apply cleaning rules
          </span>
        </label>
        <p className="muted small">Dedupe, drop implausible values, impute missing labs.</p>
      </div>

      <button className="btn btn-ghost full" onClick={() => setExport(exportCount + 1)}>
        <Download size={15} /> Export cohort CSV
      </button>

      <p className="muted tiny disclaimer">Synthetic data for demonstration only. Not for clinical use.</p>
    </aside>
  );
}
