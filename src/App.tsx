import { Activity, ClipboardCheck, FlaskConical, HeartPulse, LayoutDashboard, Siren, Users, X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";

import { Filters } from "@/components/Filters";
import { Icu } from "@/components/Icu";
import { Overview } from "@/components/Overview";
import { Patients } from "@/components/Patients";
import { Quality } from "@/components/Quality";
import { Simulator } from "@/components/Simulator";
import { useShinyBusy, useShinyInitialized, useShinyInput, useShinyMessageHandler, useShinyOutputStatus } from "@/shiny";
import type { AlertMsg, BedVitals, ToastMsg, VitalsMsg } from "@/types";

type Tab = "overview" | "patients" | "icu" | "simulator" | "quality";
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "overview", label: "Population", icon: <LayoutDashboard size={15} /> },
  { id: "patients", label: "Patients", icon: <Users size={15} /> },
  { id: "icu", label: "ICU Live", icon: <HeartPulse size={15} /> },
  { id: "simulator", label: "What-if", icon: <FlaskConical size={15} /> },
  { id: "quality", label: "Data quality", icon: <ClipboardCheck size={15} /> },
];

type Toast = ToastMsg & { id: number };

const OUTPUT_IDS = ["kpis", "risk_hist", "breakdown", "comorbidity", "patients", "patient_detail", "simulation", "quality"];

/**
 * Keep every output subscribed for the life of the page. shinyreact 0.1 removes
 * an output's element when its last reader unmounts (here: on a tab switch)
 * before Shiny unbinds it, which leaves orphaned bindings that log "Output not
 * found" and "Duplicate output IDs". A permanent status subscriber per id means
 * the element is created once and never torn down.
 */
function KeepOutputsBound() {
  for (const id of OUTPUT_IDS) useShinyOutputStatus(id); // fixed-length loop: hook order is stable
  return null;
}

function beep(level: "medium" | "high") {
  try {
    const ctx = new AudioContext();
    const notes = level === "high" ? [880, 660, 880] : [660];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const gain = ctx.createGain();
      o.frequency.value = f;
      gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
      o.connect(gain).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.17);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Audio is a nicety; browsers may block it before a user gesture.
  }
}

/** The ICU feed lives at the app root so escalations arrive on every tab. */
function useIcuFeed(sound: boolean, pushToast: (t: ToastMsg) => void) {
  useShinyInput<boolean>("monitor_running", true, { debounceMs: 0 });
  const [beds, setBeds] = useState<BedVitals[] | null>(null);
  const [clock, setClock] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const [alarms, setAlarms] = useState<AlertMsg[]>([]);

  useShinyMessageHandler<VitalsMsg>("vitals", (m) => {
    setBeds(m.beds);
    setClock(m.t);
    setHistory((h) => {
      const next: Record<string, number[]> = {};
      for (const b of m.beds) next[b.id] = [...(h[b.id] ?? []), b.score].slice(-60);
      return next;
    });
  });
  useShinyMessageHandler<AlertMsg>("alert", (a) => {
    setAlarms((x) => [a, ...x].slice(0, 40));
    pushToast({
      title: `${a.bed} · NEWS2 ${a.score}`,
      text: `${a.patient}: ${a.level === "high" ? "emergency response" : "urgent clinical review"} needed.`,
      level: a.level === "high" ? "danger" : "warn",
    });
    if (sound && (a.level === "high" || a.level === "medium")) beep(a.level);
  });
  return { beds, clock, history, alarms };
}

export default function App() {
  const initialized = useShinyInitialized();
  const busy = useShinyBusy();
  const [tab, setTab] = useState<Tab>("overview");
  const [sound, setSound] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const pushToast = useCallback((t: ToastMsg) => {
    const id = ++nextId.current;
    setToasts((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 5500);
  }, []);

  const icu = useIcuFeed(sound, pushToast);
  useShinyMessageHandler<ToastMsg>("toast", pushToast);
  useShinyMessageHandler<{ filename: string; csv: string }>("download", ({ filename, csv }) => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  });

  const hot = (icu.beds ?? []).filter((b) => b.level === "high" || b.level === "medium").length;

  if (!initialized) {
    return (
      <div className="boot">
        <Activity className="boot-icon" size={42} />
        <span>Connecting to Pulse…</span>
      </div>
    );
  }

  return (
    <div className="app">
      <KeepOutputsBound />
      <div className={`busy-bar ${busy ? "on" : ""}`} />
      <header className="topbar">
        <div className="brand">
          <div className="logo">
            <Activity size={18} />
          </div>
          <div>
            <b>Pulse</b>
            <span className="muted small"> Health Command Center</span>
          </div>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-label={t.label} aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              {t.icon}
              <span>{t.label}</span>
              {t.id === "icu" && hot > 0 && <i className="tab-badge">{hot}</i>}
            </button>
          ))}
        </nav>
        <button className={`icu-chip ${hot ? "hot" : ""}`} onClick={() => setTab("icu")} title="ICU status">
          <Siren size={14} />
          {hot ? `${hot} bed${hot > 1 ? "s" : ""} escalated` : "ICU stable"}
        </button>
      </header>

      <div className="shell">
        {tab !== "icu" && <Filters />}
        <main className="main">
          {tab === "overview" && <Overview />}
          {tab === "patients" && <Patients />}
          {tab === "icu" && <Icu {...icu} sound={sound} setSound={setSound} />}
          {tab === "simulator" && <Simulator />}
          {tab === "quality" && <Quality />}
        </main>
      </div>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.level}`}>
            <div>
              <b>{t.title}</b>
              <p>{t.text}</p>
            </div>
            <button aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

