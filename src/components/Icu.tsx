import { BellOff, BellRing, HeartPulse, Pause, Play, Siren, Syringe, Thermometer, Wind } from "lucide-react";
import { useEffect, useRef } from "react";

import { useShinyInput, useSetShinyInput } from "@/shiny";
import type { AlertMsg, BedVitals, News2Level } from "@/types";

export const LEVEL_COLOR: Record<News2Level, string> = {
  low: "#34d399",
  "low-medium": "#fbbf24",
  medium: "#fb923c",
  high: "#f43f5e",
};
const LEVEL_LABEL: Record<News2Level, string> = {
  low: "Low",
  "low-medium": "Low–medium",
  medium: "Medium",
  high: "High",
};

type WaveKind = "ecg" | "pleth" | "resp";

const g = (p: number, mu: number, sd: number) => Math.exp(-(((p - mu) / sd) ** 2));

/** One beat (or breath) of each waveform, phase in [0, 1). Output roughly in [-0.4, 1]. */
function shape(kind: WaveKind, p: number) {
  if (kind === "ecg") {
    return 0.12 * g(p, 0.12, 0.03) - 0.1 * g(p, 0.235, 0.01) + 1.0 * g(p, 0.255, 0.012) - 0.28 * g(p, 0.278, 0.012) + 0.28 * g(p, 0.48, 0.05);
  }
  if (kind === "pleth") return 0.95 * g(p, 0.2, 0.09) + 0.35 * g(p, 0.46, 0.1) - 0.1;
  return 0.5 * Math.sin(2 * Math.PI * p);
}

/** A bedside-monitor sweep trace: draws left to right, erasing just ahead of the pen. */
function Wave({ kind, rate, color, amp = 1 }: { kind: WaveKind; rate: number; color: string; amp?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ rate, color, amp });
  live.current = { rate, color, amp };

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let w = 0;
    let h = 0;
    let x = 0;
    let lastY: number | null = null;
    let phase = Math.random();
    let last = performance.now();
    let raf = 0;
    const speed = kind === "resp" ? 28 : 72; // px per second

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      x = 0;
      lastY = null;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { rate, color, amp } = live.current;
      const steps = Math.max(1, Math.round(dt * speed));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.7;
      ctx.lineCap = "round";
      for (let i = 0; i < steps; i++) {
        phase = (phase + ((rate / 60) * dt) / steps) % 1;
        const jitter = kind === "ecg" ? (Math.random() - 0.5) * 0.03 : 0;
        const y = h * (kind === "ecg" ? 0.68 : 0.55) - (shape(kind, phase) * amp + jitter) * h * 0.55;
        const nx = x + (dt * speed) / steps;
        ctx.clearRect(nx, 0, 16, h);
        if (lastY != null) {
          ctx.beginPath();
          ctx.moveTo(x, lastY);
          ctx.lineTo(nx, y);
          ctx.stroke();
        }
        x = nx;
        lastY = y;
        if (x > w) {
          x = 0;
          lastY = null;
          ctx.clearRect(0, 0, 16, h);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [kind]);

  // The canvas is absolutely positioned in a sized box: an in-flow canvas would
  // feed its own pixel size back into its layout height on every resize.
  return (
    <div className="wave-box">
      <canvas ref={ref} className={`wave wave-${kind}`} style={{ color }} />
    </div>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const W = 120;
  const H = 28;
  const max = 15;
  const pts = values.map((v, i) => `${(i / 59) * W},${H - (Math.min(v, max) / max) * H}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <line x1="0" x2={W} y1={H - (5 / max) * H} y2={H - (5 / max) * H} stroke="#fb923c" strokeOpacity=".35" strokeDasharray="2 3" />
      <line x1="0" x2={W} y1={H - (7 / max) * H} y2={H - (7 / max) * H} stroke="#f43f5e" strokeOpacity=".35" strokeDasharray="2 3" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

const PART_LABEL: Record<string, string> = {
  rr: "Resp rate",
  spo2: "SpO₂",
  oxygen: "Supplemental O₂",
  sbp: "Systolic BP",
  hr: "Pulse",
  conscious: "Consciousness",
  temp: "Temperature",
};

function BedCard({ b, history, onTreat }: { b: BedVitals; history: number[]; onTreat: () => void }) {
  const color = LEVEL_COLOR[b.level];
  const parts = Object.entries(b.parts).filter(([, v]) => v > 0);
  return (
    <article className={`bed lvl-${b.level}`} style={{ "--lvl": color } as React.CSSProperties}>
      <header className="bed-head">
        <div>
          <div className="bed-id">{b.id}</div>
          <div className="bed-pt">
            {b.patient}, {b.age}
          </div>
          <div className="bed-dx muted">{b.diagnosis}</div>
        </div>
        <div className="news" title={parts.map(([k, v]) => `${PART_LABEL[k]} +${v}`).join("\n") || "All parameters normal"}>
          <span className="news-score">{b.score}</span>
          <span className="news-label">NEWS2 · {LEVEL_LABEL[b.level]}</span>
        </div>
      </header>

      <div className="trace">
        <Wave kind="ecg" rate={b.hr} color="#34d399" />
        <div className="trace-num hr">
          <span>HR</span>
          <b>{b.hr}</b>
        </div>
      </div>
      <div className="trace">
        <Wave kind="pleth" rate={b.hr} color="#22d3ee" amp={Math.max(0.35, (b.spo2 - 70) / 28)} />
        <div className="trace-num spo2">
          <span>SpO₂</span>
          <b>{b.spo2}</b>
        </div>
      </div>
      <div className="trace short">
        <Wave kind="resp" rate={b.rr} color="#fbbf24" amp={0.8} />
        <div className="trace-num rr">
          <span>RR</span>
          <b>{b.rr}</b>
        </div>
      </div>

      <div className="bed-vitals">
        <span>
          <HeartPulse size={12} /> {b.sbp}/{b.dbp}
        </span>
        <span>
          <Thermometer size={12} /> {b.temp.toFixed(1)}°
        </span>
        <span className={b.oxygen ? "on" : ""}>
          <Wind size={12} /> {b.oxygen ? "O₂" : "Air"}
        </span>
        <span className={b.conscious !== "A" ? "alarm" : ""}>{b.conscious === "A" ? "Alert" : "Confused"}</span>
      </div>

      <footer className="bed-foot">
        <Spark values={history} color={color} />
        {(b.deteriorating || b.level === "high" || b.level === "medium") && (
          <button className="btn btn-danger sm" onClick={onTreat}>
            <Syringe size={13} /> Sepsis bundle
          </button>
        )}
      </footer>
    </article>
  );
}

export function Icu({
  beds,
  history,
  alarms,
  clock,
  sound,
  setSound,
}: {
  beds: BedVitals[] | null;
  history: Record<string, number[]>;
  alarms: AlertMsg[];
  clock: string | null;
  sound: boolean;
  setSound: (v: boolean) => void;
}) {
  const [running, setRunning] = useShinyInput<boolean>("monitor_running", true, { debounceMs: 0 });
  const [count, setCount] = useShinyInput<number>("deteriorate", 0, { debounceMs: 0, priority: "event" });
  const treat = useSetShinyInput<{ bed: string; nonce: number } | null>("treat_bed", null, { debounceMs: 0, priority: "event" });

  const counts = { low: 0, "low-medium": 0, medium: 0, high: 0 } as Record<News2Level, number>;
  (beds ?? []).forEach((b) => counts[b.level]++);

  return (
    <div className="view icu">
      <div className="icu-bar">
        <div className="icu-title">
          <span className={`live-dot ${running ? "on" : ""}`} />
          <b>ICU Telemetry</b>
          <span className="muted">· {running ? `live · ${clock ?? "connecting"}` : "paused"}</span>
        </div>
        <div className="icu-summary">
          {(Object.keys(counts) as News2Level[]).map((l) => (
            <span key={l} className="lvl-pill" style={{ "--lvl": LEVEL_COLOR[l] } as React.CSSProperties}>
              {counts[l]} {LEVEL_LABEL[l]}
            </span>
          ))}
        </div>
        <div className="icu-actions">
          <button className="btn btn-ghost sm" onClick={() => setSound(!sound)} title="Alarm sound">
            {sound ? <BellRing size={14} /> : <BellOff size={14} />}
          </button>
          <button className="btn btn-ghost sm" onClick={() => setRunning(!running)}>
            {running ? <Pause size={14} /> : <Play size={14} />} {running ? "Pause" : "Resume"}
          </button>
          <button className="btn btn-warn sm" onClick={() => setCount(count + 1)} disabled={!running}>
            <Siren size={14} /> Simulate deterioration
          </button>
        </div>
      </div>

      <div className="icu-body">
        <div className="beds">
          {beds
            ? beds.map((b) => (
                <BedCard key={b.id} b={b} history={history[b.id] ?? []} onTreat={() => treat({ bed: b.id, nonce: Date.now() })} />
              ))
            : Array.from({ length: 8 }, (_, i) => <div key={i} className="bed skeleton" />)}
        </div>
        <aside className="card alarms">
          <h3>
            <Siren size={15} /> Escalations
          </h3>
          <p className="muted small">NEWS2 ≥5 calls for urgent review; ≥7 triggers the emergency team.</p>
          <ol>
            {alarms.length === 0 && <li className="muted small">No escalations yet. Try “Simulate deterioration”.</li>}
            {alarms.map((a, i) => (
              <li key={i} className="alarm-item" style={{ "--lvl": LEVEL_COLOR[a.level] } as React.CSSProperties}>
                <span className="alarm-score">{a.score}</span>
                <span>
                  <b>{a.bed}</b> {a.patient}
                  <br />
                  <span className="muted small">
                    {a.t} · {a.level === "high" ? "Emergency response" : "Urgent review"}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
