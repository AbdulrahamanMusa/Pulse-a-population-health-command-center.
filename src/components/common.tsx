import type { CSSProperties, ReactNode } from "react";

import { useShinyOutputError, useShinyOutputStatus } from "@/shiny";
import type { Tier } from "@/types";

// Hex, not CSS variables: Recharts writes these into SVG attributes.
export const C = {
  accent: "#2dd4bf",
  blue: "#60a5fa",
  violet: "#a78bfa",
  pink: "#f472b6",
  amber: "#fbbf24",
  red: "#f43f5e",
  green: "#34d399",
  grid: "#1e293b",
  axis: "#64748b",
  text: "#cbd5e1",
};

export const TIER_COLOR: Record<Tier, string> = {
  Low: C.green,
  Moderate: C.amber,
  High: "#fb923c",
  "Very high": C.red,
};

export const axisProps = {
  stroke: C.axis,
  tick: { fill: C.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: C.grid },
} as const;

export const tooltipProps = {
  contentStyle: { background: "#0f172a", border: "1px solid #334155", borderRadius: 10, color: C.text, fontSize: 12 },
  labelStyle: { color: "#f1f5f9", fontWeight: 600 },
  cursor: { fill: "rgba(148,163,184,0.08)" },
} as const;

export const fmt = {
  int: (n: number | null | undefined) => (n == null ? "–" : Math.round(n).toLocaleString()),
  pct: (n: number | null | undefined, d = 1) => (n == null ? "–" : `${n.toFixed(d)}%`),
  usd: (n: number | null | undefined) => {
    if (n == null) return "–";
    const a = Math.abs(n);
    const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e4 ? `$${(a / 1e3).toFixed(0)}k` : `$${Math.round(a).toLocaleString()}`;
    return n < 0 ? `−${s}` : s;
  },
};

/** A card bound to one output: skeleton before the first value, dimmed while recalculating. */
export function Card({
  title,
  subtitle,
  output,
  ready,
  actions,
  className = "",
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  output?: string;
  ready?: boolean;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p className="muted small">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {output ? (
        <OutputBody output={output} ready={ready ?? true}>
          {children}
        </OutputBody>
      ) : (
        children
      )}
    </section>
  );
}

function OutputBody({ output, ready, children }: { output: string; ready: boolean; children: ReactNode }) {
  const status = useShinyOutputStatus(output);
  const error = useShinyOutputError(output);
  if (error) return <div className="output-error">{error.message}</div>;
  if (!ready) return <div className="skeleton" />;
  return <div className={status === "recalculating" ? "recalculating" : "settled"}>{children}</div>;
}

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className="tier-badge" style={{ "--c": TIER_COLOR[tier] } as CSSProperties}>
      {tier}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
