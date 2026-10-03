import { CheckCircle2, Copy, Eraser, Hourglass, Wand2 } from "lucide-react";

import { C, Card, fmt } from "@/components/common";
import { useShinyInput, useShinyOutputValue } from "@/shiny";
import type { Quality as Q, QualityReport } from "@/types";

function Ring({ pct, color, label }: { pct: number; color: string; label: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg viewBox="0 0 120 120" role="img" aria-label={`${label} ${pct}%`}>
        <circle cx="60" cy="60" r={r} stroke="#1e293b" strokeWidth="11" fill="none" />
        <circle
          cx="60"
          cy="60"
          r={r}
          stroke={color}
          strokeWidth="11"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
        <text x="60" y="64" textAnchor="middle" className="ring-val">
          {pct.toFixed(1)}%
        </text>
      </svg>
      <span>{label}</span>
    </div>
  );
}

function FieldTable({ rep }: { rep: QualityReport }) {
  const worst = Math.max(1, ...rep.fields.map((f) => f.missing + f.out_of_range));
  return (
    <table className="qtable">
      <thead>
        <tr>
          <th>Field</th>
          <th>Valid range</th>
          <th>Missing</th>
          <th>Out of range</th>
          <th className="w40">Defects</th>
          <th>Valid</th>
        </tr>
      </thead>
      <tbody>
        {rep.fields.map((f) => (
          <tr key={f.field}>
            <td>
              <code>{f.field}</code>
            </td>
            <td className="muted">
              {f.range[0]}–{f.range[1]}
            </td>
            <td>{fmt.int(f.missing)}</td>
            <td className={f.out_of_range ? "bad" : ""}>{fmt.int(f.out_of_range)}</td>
            <td>
              <div className="qbar">
                <div className="qm" style={{ width: `${(100 * f.missing) / worst}%` }} />
                <div className="qo" style={{ width: `${(100 * f.out_of_range) / worst}%` }} />
              </div>
            </td>
            <td>
              <b style={{ color: f.valid_pct > 98 ? C.green : f.valid_pct > 94 ? C.amber : C.red }}>{f.valid_pct.toFixed(1)}%</b>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Quality() {
  const q = useShinyOutputValue<Q>("quality");
  const [clean, setClean] = useShinyInput<boolean>("clean_data", false);
  const rep = q ? (clean ? q.clean : q.raw) : null;

  return (
    <div className="view quality">
      <Card
        title="Registry data quality"
        subtitle="Rules run on every refresh. Toggle to see analytics before and after cleaning."
        output="quality"
        ready={!!q}
        actions={
          <div className="segmented big" role="group" aria-label="Registry version">
            <button className={!clean ? "on" : ""} onClick={() => setClean(false)}>
              Raw
            </button>
            <button className={clean ? "on" : ""} onClick={() => setClean(true)}>
              <Wand2 size={13} /> Cleaned
            </button>
          </div>
        }
      >
        {q && rep && (
          <div className="q-top">
            <div className="rings">
              <Ring pct={q.raw.completeness} color={C.amber} label="Raw completeness" />
              <Ring pct={q.clean.completeness} color={C.green} label="After cleaning" />
            </div>
            <div className="q-facts">
              <div>
                <Copy size={16} />
                <b>{fmt.int(rep.duplicates)}</b>
                <span>duplicate records</span>
              </div>
              <div>
                <Hourglass size={16} />
                <b>{fmt.int(rep.stale_records)}</b>
                <span>not seen in 12 months</span>
              </div>
              <div>
                <CheckCircle2 size={16} />
                <b>{fmt.int(rep.unique_patients)}</b>
                <span>unique patients of {fmt.int(rep.records)} rows</span>
              </div>
            </div>
            <div className="q-log">
              <h4 className="mini-title">
                <Eraser size={13} /> Cleaning pipeline
              </h4>
              <ol>
                <li>
                  Deduplicate on patient ID <b>−{q.log.duplicates_removed}</b>
                </li>
                <li>
                  Null implausible values <b>{q.log.out_of_range_nulled}</b>
                </li>
                <li>
                  Impute by diabetes status (median) <b>{q.log.values_imputed}</b>
                </li>
              </ol>
            </div>
          </div>
        )}
      </Card>
      {rep && (
        <Card title={`Field profile · ${clean ? "cleaned" : "raw"}`} subtitle={<><i className="key qm" /> missing <i className="key qo" /> out of range</>}>
          <FieldTable rep={rep} />
        </Card>
      )}
    </div>
  );
}
