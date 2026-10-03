// The JSON contract: one type per reactive_output in app.py.

export type Tier = "Low" | "Moderate" | "High" | "Very high";

export interface Kpi {
  patients: number;
  mean_age: number | null;
  mean_risk: number | null;
  high_risk: number;
  readmit_rate: number | null;
  total_cost: number;
  cost_per_patient: number | null;
  ed_per_1000: number | null;
  bp_controlled: number | null;
  a1c_controlled: number | null;
  tiers: Record<Tier, number>;
}
export interface Kpis extends Kpi {
  population: Kpi;
}

export interface HistBin {
  lo: number;
  hi: number;
  label: string;
  count: number;
  tier: Tier;
}

export interface Breakdown {
  age_sex: { band: string; Female: number; Male: number; Female_n: number; Male_n: number }[];
  region: { region: string; patients: number; mean_risk: number; cost_per_patient: number }[];
  prevalence: { condition: string; key: string; pct: number }[];
}

export interface Comorbidity {
  labels: string[];
  cells: { i: number; j: number; count: number; lift: number | null }[];
  multimorbidity: { conditions: string; patients: number }[];
}

export interface PatientRow {
  id: string;
  name: string;
  age: number;
  sex: string;
  region: string;
  risk: number;
  tier: Tier;
  conditions: string[];
}
export interface PatientList {
  total: number;
  rows: PatientRow[];
}

export interface PatientDetail {
  id: string;
  name: string;
  age: number;
  sex: string;
  region: string;
  insurance: string;
  smoker: boolean;
  conditions: string[];
  risk: number;
  tier: Tier;
  vitals: Record<"bmi" | "sbp" | "dbp" | "hba1c" | "ldl" | "egfr", number | null>;
  utilization: { admissions_12m: number; ed_visits_12m: number; cost_12m: number; last_visit: string };
  intercept: number;
  drivers: { driver: string; logit: number }[];
  timeline: { date: string; hba1c: number; sbp: number; bmi: number }[];
  events: { date: string; kind: string; detail: string }[];
}

export interface SimInput {
  hba1c: number;
  sbp: number;
  smoking: number;
  enroll: number;
}
export interface Simulation {
  patients: number;
  enrolled: number;
  quitters: number;
  baseline_events: number;
  scenario_events: number;
  avoided: number;
  savings: number;
  program_cost: number;
  net: number;
  roi: number | null;
  nnt: number | null;
  tiers: { tier: Tier; baseline: number; scenario: number }[];
  histogram: { label: string; baseline: number; scenario: number }[];
}

export interface QualityReport {
  records: number;
  unique_patients: number;
  duplicates: number;
  stale_records: number;
  completeness: number;
  fields: {
    field: string;
    missing: number;
    missing_pct: number;
    out_of_range: number;
    range: [number, number];
    valid_pct: number;
  }[];
}
export interface Quality {
  raw: QualityReport;
  clean: QualityReport;
  log: { duplicates_removed: number; out_of_range_nulled: number; values_imputed: number };
}

export type News2Level = "low" | "low-medium" | "medium" | "high";
export interface BedVitals {
  id: string;
  patient: string;
  age: number;
  diagnosis: string;
  hr: number;
  rr: number;
  spo2: number;
  sbp: number;
  dbp: number;
  temp: number;
  oxygen: boolean;
  conscious: string;
  deteriorating: boolean;
  score: number;
  level: News2Level;
  parts: Record<string, number>;
}
export interface VitalsMsg {
  t: string;
  beds: BedVitals[];
}
export interface AlertMsg {
  bed: string;
  patient: string;
  score: number;
  level: News2Level;
  t: string;
}
export interface ToastMsg {
  title: string;
  text: string;
  level: "ok" | "info" | "warn" | "danger";
}
