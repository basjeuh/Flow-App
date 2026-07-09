"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

function fmtDuration(sec) {
  if (!sec) return "–";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}u` : `${m}m`;
}
function fmtDistance(m) {
  if (!m) return "–";
  return `${(m / 1000).toFixed(1)} km`;
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtPace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return "–";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

// Brede categorie op basis van het sportlabel, voor grafieken/PR's.
// (Doelen gebruiken het exacte, ruwe sportlabel — dat blijft los hiervan.)
function sportCategory(sport) {
  const s = (sport || "").toLowerCase();
  if (s.includes("run")) return "hardlopen";
  if (s.includes("ride") || s.includes("cycl") || s.includes("bike")) return "fietsen";
  return "overig";
}
const CATEGORY_COLOR = { hardlopen: "var(--garmin)", fietsen: "var(--polar)", overig: "var(--accent)" };

// Afstandscategorieën voor de Running Index-ontwikkeling.
const DISTANCE_CATEGORIES = [
  { key: "≤5km", test: (m) => m <= 5000, color: "var(--accent)" },
  { key: "6-10km", test: (m) => m > 5000 && m <= 10000, color: "var(--garmin)" },
  { key: "11-21km", test: (m) => m > 10000 && m <= 21100, color: "var(--polar)" },
  { key: "22km+", test: (m) => m > 21100, color: "#e85d75" },
];

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [syncResult, setSyncResult] = useState(null);

  const [goals, setGoals] = useState([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({
    title: "",
    sport: "",
    metric: "distance_m",
    target: "",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
  });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/activities");
      const data = await res.json();
      if (data.error) setError(data.error);
      setActivities(data.activities || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function loadGoals() {
    const res = await fetch("/api/goals");
    const data = await res.json();
    setGoals(data.goals || []);
  }

  async function sync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      setSyncResult(data);
      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function submitGoal(e) {
    e.preventDefault();
    const targetRaw = Number(goalForm.target);
    const target_value =
      goalForm.metric === "distance_m" ? targetRaw * 1000 :
      goalForm.metric === "duration_s" ? targetRaw * 3600 :
      targetRaw;

    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...goalForm, target_value }),
    });
    setShowGoalForm(false);
    setGoalForm({ title: "", sport: "", metric: "distance_m", target: "", start_date: new Date().toISOString().slice(0, 10), end_date: "" });
    await loadGoals();
  }

  async function removeGoal(id) {
    await fetch(`/api/goals/${id}`, { method: "DELETE" });
    await loadGoals();
  }

  useEffect(() => {
    load();
    loadGoals();
  }, []);

  const availableSports = useMemo(
    () => [...new Set(activities.map((a) => a.sport).filter(Boolean))],
    [activities]
  );

  // --- Weekvolume per sportcategorie (laatste 16 weken) ---
  const weeklyData = useMemo(() => {
    const buckets = {};
    for (const a of activities) {
      const d = new Date(a.start_time);
      const wk = isoWeekKey(d);
      const cat = sportCategory(a.sport);
      buckets[wk] = buckets[wk] || { week: wk, hardlopen: 0, fietsen: 0, overig: 0 };
      buckets[wk][cat] += (Number(a.distance_m) || 0) / 1000;
    }
    return Object.values(buckets)
      .sort((a, b) => (a.week > b.week ? 1 : -1))
      .slice(-16)
      .map((b) => ({ ...b, hardlopen: +b.hardlopen.toFixed(1), fietsen: +b.fietsen.toFixed(1), overig: +b.overig.toFixed(1) }));
  }, [activities]);

  // --- Fitness-trend: voortschrijdend 7d/28d gemiddelde (km/dag) ---
  const trendData = useMemo(() => {
    if (activities.length === 0) return [];
    const dayTotals = {};
    for (const a of activities) {
      const k = dayKey(new Date(a.start_time));
      dayTotals[k] = (dayTotals[k] || 0) + (Number(a.distance_m) || 0) / 1000;
    }
    const days = Object.keys(dayTotals).sort();
    const first = new Date(days[0]);
    const last = new Date();
    const series = [];
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      series.push({ date: dayKey(d), km: dayTotals[dayKey(d)] || 0 });
    }
    const withAvg = series.map((pt, i) => {
      const w7 = series.slice(Math.max(0, i - 6), i + 1);
      const w28 = series.slice(Math.max(0, i - 27), i + 1);
      return {
        date: pt.date,
        avg7: +(w7.reduce((s, x) => s + x.km, 0) / 7).toFixed(2),
        avg28: +(w28.reduce((s, x) => s + x.km, 0) / 28).toFixed(2),
      };
    });
    // alleen laatste 90 dagen tonen, en niet elk punt labelen
    return withAvg.slice(-90).filter((_, i) => i % 3 === 0);
  }, [activities]);

  // --- Per-categorie samenvatting + PR's ---
  const categoryStats = useMemo(() => {
    const cats = { hardlopen: [], fietsen: [], overig: [] };
    for (const a of activities) cats[sportCategory(a.sport)].push(a);

    return Object.entries(cats)
      .filter(([, list]) => list.length > 0)
      .map(([cat, list]) => {
        const totalKm = list.reduce((s, a) => s + (Number(a.distance_m) || 0), 0) / 1000;
        const totalTime = list.reduce((s, a) => s + (Number(a.duration_s) || 0), 0);
        const longest = Math.max(...list.map((a) => Number(a.distance_m) || 0));
        const paces = list
          .filter((a) => a.distance_m > 500 && a.duration_s)
          .map((a) => a.duration_s / (a.distance_m / 1000));
        const bestPace = paces.length ? Math.min(...paces) : null;
        const maxElevation = Math.max(0, ...list.map((a) => Number(a.elevation_gain_m) || 0));
        return { cat, count: list.length, totalKm, totalTime, longest, bestPace, maxElevation };
      });
  }, [activities]);

  // --- Consistentie-heatmap: laatste 12 weken ---
  const heatmap = useMemo(() => {
    const dayDuration = {};
    for (const a of activities) {
      const k = dayKey(new Date(a.start_time));
      dayDuration[k] = (dayDuration[k] || 0) + (Number(a.duration_s) || 0);
    }
    const today = new Date();
    const weeks = [];
    for (let w = 11; w >= 0; w--) {
      const days = [];
      for (let d = 6; d >= 0; d--) {
        const date = new Date(today);
        date.setDate(today.getDate() - w * 7 - d);
        days.push({ date: dayKey(date), sec: dayDuration[dayKey(date)] || 0 });
      }
      weeks.push(days);
    }
    return weeks;
  }, [activities]);

  const [weekOffset, setWeekOffset] = useState(0); // 0 = deze week, -1 = vorige week, ...

  function getWeekRange(offset) {
    const now = new Date();
    const day = now.getDay() || 7; // maandag = start van de week
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - day + 1 + offset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  }

  const selectedWeek = useMemo(() => {
    const { start, end } = getWeekRange(weekOffset);
    const weekActivities = activities.filter((a) => {
      const t = new Date(a.start_time);
      return t >= start && t <= end;
    });
    const km = weekActivities.reduce((s, a) => s + (Number(a.distance_m) || 0), 0) / 1000;
    const time = weekActivities.reduce((s, a) => s + (Number(a.duration_s) || 0), 0);
    const byCat = {};
    for (const a of weekActivities) {
      const cat = sportCategory(a.sport);
      byCat[cat] = (byCat[cat] || 0) + (Number(a.distance_m) || 0) / 1000;
    }
    return { start, end, activities: weekActivities, km, time, byCat };
  }, [activities, weekOffset]);

  const oldestActivityDate = useMemo(() => {
    if (activities.length === 0) return null;
    return activities.reduce((min, a) => (new Date(a.start_time) < min ? new Date(a.start_time) : min), new Date());
  }, [activities]);

  const canGoOlder = !oldestActivityDate || getWeekRange(weekOffset - 1).end >= oldestActivityDate;

  // --- Running Index-ontwikkeling per afstandscategorie ---
  const runningIndexData = useMemo(() => {
    return DISTANCE_CATEGORIES.map((cat) => {
      const points = activities
        .filter((a) => sportCategory(a.sport) === "hardlopen" && a.running_index && a.distance_m && cat.test(Number(a.distance_m)))
        .map((a) => ({ date: a.start_time.slice(0, 10), index: Number(a.running_index) }))
        .sort((a, b) => (a.date > b.date ? 1 : -1));
      return { ...cat, points };
    });
  }, [activities]);

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const thisWeek = activities.filter((a) => new Date(a.start_time) >= weekAgo);
    const totalKm = thisWeek.reduce((s, a) => s + (Number(a.distance_m) || 0), 0) / 1000;
    const totalTime = thisWeek.reduce((s, a) => s + (Number(a.duration_s) || 0), 0);
    const hrValues = activities.filter((a) => a.avg_hr).slice(0, 10);
    const avgHr = hrValues.length ? Math.round(hrValues.reduce((s, a) => s + Number(a.avg_hr), 0) / hrValues.length) : null;
    return { count: activities.length, weekKm: totalKm.toFixed(1), weekTime: fmtDuration(totalTime), avgHr: avgHr ?? "–" };
  }, [activities]);

  return (
    <main className="wrap">
      <div className="top-nav">
        <div className="brand">TrainHub</div>
        <button className="btn" onClick={sync} disabled={syncing}>
          {syncing ? "bezig..." : "sync nu"}
        </button>
      </div>
      <div className="eyebrow">dashboard</div>
      <h1 className="hero" style={{ fontSize: "32px" }}>Trainingsoverzicht</h1>

      <div className="stat-row" style={{ gridTemplateColumns: "1fr" }}>
        <div className="stat" style={{ padding: 20 }}>
          <div className="top-nav" style={{ marginBottom: 14 }}>
            <button className="btn" onClick={() => setWeekOffset((w) => w - 1)}>← vorige week</button>
            <div className="stat-label" style={{ fontSize: 13 }}>
              {selectedWeek.start.toLocaleDateString("nl-NL", { day: "2-digit", month: "short" })}
              {" – "}
              {selectedWeek.end.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" })}
              {weekOffset === 0 && "  ·  deze week"}
            </div>
            <button className="btn" onClick={() => setWeekOffset((w) => w + 1)} disabled={weekOffset >= 0}>
              volgende week →
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 16 }}>
            <div>
              <div className="stat-label">km</div>
              <div className="stat-value readout">{selectedWeek.km.toFixed(1)}</div>
            </div>
            <div>
              <div className="stat-label">tijd</div>
              <div className="stat-value readout">{fmtDuration(selectedWeek.time)}</div>
            </div>
            <div>
              <div className="stat-label">activiteiten</div>
              <div className="stat-value readout">{selectedWeek.activities.length}</div>
            </div>
            {Object.entries(selectedWeek.byCat).map(([cat, km]) => (
              <div key={cat}>
                <div className="stat-label">{cat}</div>
                <div className="stat-value readout" style={{ color: CATEGORY_COLOR[cat], fontSize: 20 }}>
                  {km.toFixed(1)} km
                </div>
              </div>
            ))}
          </div>
          {!canGoOlder && (
            <div className="card-desc" style={{ marginTop: 10 }}>Geen oudere trainingen beschikbaar.</div>
          )}
          {selectedWeek.activities.length > 0 && (
            <div className="activity-list" style={{ marginTop: 16 }}>
              {selectedWeek.activities.map((a) => (
                <div className="activity-row" key={`wk-${a.provider}-${a.id}`}>
                  <span className={`dot ${a.provider === "polar" ? "polar" : "garmin"}`} />
                  <div>
                    <div className="activity-sport">{a.sport || a.source_sport || "activiteit"}</div>
                    <div className="activity-date">{fmtDate(a.start_time)}</div>
                  </div>
                  <div className="readout hide-mobile">{fmtDistance(a.distance_m)}</div>
                  <div className="readout hide-mobile">{fmtDuration(a.duration_s)}</div>
                  <div className="readout hide-mobile">{a.avg_hr ? `${Math.round(a.avg_hr)} bpm` : "–"}</div>
                  <div className="readout">{a.training_load ? Math.round(a.training_load) : "–"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="stat">
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <div className="stat-label">totaal activiteiten</div>
              <div className="stat-value readout">{stats.count}</div>
            </div>
            <div>
              <div className="stat-label">gem. hr (laatste 10)</div>
              <div className="stat-value readout">{stats.avgHr}</div>
            </div>
          </div>
        </div>
      </div>

      {error && <p style={{ color: "var(--polar)" }}>Fout: {error}</p>}

      {!loading && activities.length > 0 && (
        <>
          {/* Weekvolume */}
          <h2 className="card-title" style={{ marginBottom: 12 }}>Weekvolume</h2>
          <div style={{ width: "100%", height: 220, marginBottom: 40 }}>
            <ResponsiveContainer>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="week" tick={{ fill: "var(--text-dim)", fontSize: 11 }} tickFormatter={(w) => w.split("-W")[1]} />
                <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} unit="km" />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="hardlopen" stackId="a" fill={CATEGORY_COLOR.hardlopen} radius={[3, 3, 0, 0]} />
                <Bar dataKey="fietsen" stackId="a" fill={CATEGORY_COLOR.fietsen} radius={[3, 3, 0, 0]} />
                <Bar dataKey="overig" stackId="a" fill={CATEGORY_COLOR.overig} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Fitness-trend */}
          <h2 className="card-title" style={{ marginBottom: 12 }}>Fitness-trend (km/dag, voortschrijdend)</h2>
          <div style={{ width: "100%", height: 200, marginBottom: 40 }}>
            <ResponsiveContainer>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="date" tick={{ fill: "var(--text-dim)", fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="avg7" name="7-daags" stroke="var(--accent)" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="avg28" name="28-daags" stroke="var(--text-dim)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Per-sport PR's */}
          <h2 className="card-title" style={{ marginBottom: 12 }}>Per sport</h2>
          <div className="connect-grid" style={{ marginBottom: 40 }}>
            {categoryStats.map((c) => (
              <div className="connect-card" key={c.cat}>
                <div className="card-title">
                  <span className="dot" style={{ background: CATEGORY_COLOR[c.cat], boxShadow: `0 0 10px ${CATEGORY_COLOR[c.cat]}` }} />
                  {c.cat}
                </div>
                <div className="card-desc">{c.count} activiteiten &middot; {c.totalKm.toFixed(0)} km totaal &middot; {fmtDuration(c.totalTime)}</div>
                <div style={{ display: "flex", gap: 20, marginTop: 4 }}>
                  <div><div className="stat-label">langste</div><div className="readout" style={{ fontSize: 18 }}>{fmtDistance(c.longest)}</div></div>
                  {c.cat === "hardlopen" && (
                    <div><div className="stat-label">beste tempo</div><div className="readout" style={{ fontSize: 18 }}>{fmtPace(c.bestPace)}</div></div>
                  )}
                  {c.cat === "fietsen" && c.maxElevation > 0 && (
                    <div><div className="stat-label">meeste hoogtemeters</div><div className="readout" style={{ fontSize: 18 }}>{Math.round(c.maxElevation)}m</div></div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Running Index-ontwikkeling per afstandscategorie */}
          {runningIndexData.some((c) => c.points.length > 0) && (
            <>
              <h2 className="card-title" style={{ marginBottom: 4 }}>Running Index per afstandscategorie</h2>
              <p className="card-desc" style={{ marginBottom: 16 }}>
                Polar's hardloop-fitnessindicator, uitgesplitst per afstand &mdash; alleen beschikbaar
                voor runs die rechtstreeks via de Polar-koppeling zijn opgehaald (niet bij TCX/GPX-import).
              </p>
              <div className="connect-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 40 }}>
                {runningIndexData.filter((c) => c.points.length > 0).map((c) => (
                  <div key={c.key} className="connect-card" style={{ gap: 8 }}>
                    <div className="card-title">
                      <span className="dot" style={{ background: c.color, boxShadow: `0 0 10px ${c.color}` }} />
                      {c.key}
                      <span className="card-desc" style={{ marginLeft: "auto" }}>{c.points.length} run(s)</span>
                    </div>
                    {c.points.length === 1 ? (
                      <div className="readout" style={{ fontSize: 26 }}>{c.points[0].index}</div>
                    ) : (
                      <div style={{ width: "100%", height: 120 }}>
                        <ResponsiveContainer>
                          <LineChart data={c.points}>
                            <XAxis dataKey="date" tick={{ fill: "var(--text-dim)", fontSize: 9 }} tickFormatter={(d) => d.slice(5)} />
                            <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fill: "var(--text-dim)", fontSize: 10 }} width={28} />
                            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }} />
                            <Line type="monotone" dataKey="index" stroke={c.color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Consistentie-heatmap */}
          <h2 className="card-title" style={{ marginBottom: 12 }}>Consistentie (laatste 12 weken)</h2>
          <div style={{ display: "flex", gap: 3, marginBottom: 40, overflowX: "auto" }}>
            {heatmap.map((week, wi) => (
              <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {week.map((day) => {
                  const intensity = day.sec === 0 ? 0 : day.sec < 1800 ? 1 : day.sec < 3600 ? 2 : 3;
                  const bg = [
                    "var(--surface)",
                    "rgba(232,163,61,0.35)",
                    "rgba(232,163,61,0.65)",
                    "var(--accent)",
                  ][intensity];
                  return (
                    <div
                      key={day.date}
                      title={`${day.date}: ${fmtDuration(day.sec)}`}
                      style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: "1px solid var(--line)" }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Doelen */}
      <div className="top-nav" style={{ marginTop: 8 }}>
        <h2 className="card-title">Doelen</h2>
        <button className="btn" onClick={() => setShowGoalForm((v) => !v)}>
          {showGoalForm ? "annuleren" : "+ nieuw doel"}
        </button>
      </div>

      {showGoalForm && (
        <form onSubmit={submitGoal} className="connect-card" style={{ marginBottom: 24, gap: 12 }}>
          <input
            placeholder="Titel (bv. 500 km hardlopen dit kwartaal)"
            required
            value={goalForm.title}
            onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
            style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, padding: 10, color: "var(--text)" }}
          />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <select
              value={goalForm.sport}
              onChange={(e) => setGoalForm({ ...goalForm, sport: e.target.value })}
              style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, padding: 10, color: "var(--text)" }}
            >
              <option value="">Alle sporten</option>
              {availableSports.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={goalForm.metric}
              onChange={(e) => setGoalForm({ ...goalForm, metric: e.target.value })}
              style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, padding: 10, color: "var(--text)" }}
            >
              <option value="distance_m">Afstand (km)</option>
              <option value="duration_s">Tijd (uur)</option>
              <option value="count">Aantal trainingen</option>
            </select>
            <input
              type="number"
              step="0.1"
              placeholder="Doelwaarde"
              required
              value={goalForm.target}
              onChange={(e) => setGoalForm({ ...goalForm, target: e.target.value })}
              style={{ width: 120, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, padding: 10, color: "var(--text)" }}
            />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <label className="stat-label" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              vanaf
              <input type="date" required value={goalForm.start_date} onChange={(e) => setGoalForm({ ...goalForm, start_date: e.target.value })}
                style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, padding: 10, color: "var(--text)" }} />
            </label>
            <label className="stat-label" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              tot en met
              <input type="date" required value={goalForm.end_date} onChange={(e) => setGoalForm({ ...goalForm, end_date: e.target.value })}
                style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, padding: 10, color: "var(--text)" }} />
            </label>
          </div>
          <button className="btn primary" type="submit">Doel opslaan</button>
        </form>
      )}

      {goals.length === 0 ? (
        <p className="empty">Nog geen doelen ingesteld.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 40 }}>
          {goals.map((g) => {
            const target = g.metric === "distance_m" ? g.target_value / 1000 : g.metric === "duration_s" ? g.target_value / 3600 : g.target_value;
            const current = g.metric === "distance_m" ? g.current / 1000 : g.metric === "duration_s" ? g.current / 3600 : g.current;
            const pct = Math.min(100, Math.round((current / target) * 100));
            const unit = g.metric === "distance_m" ? "km" : g.metric === "duration_s" ? "u" : "x";
            const daysLeft = Math.ceil((new Date(g.end_date) - new Date()) / 86400000);
            return (
              <div className="connect-card" key={g.id} style={{ gap: 8 }}>
                <div className="top-nav" style={{ marginBottom: 0 }}>
                  <div className="card-title">{g.title}</div>
                  <button className="btn" onClick={() => removeGoal(g.id)} style={{ padding: "4px 10px", fontSize: 11 }}>verwijderen</button>
                </div>
                <div className="card-desc">
                  {g.sport ? `${g.sport} · ` : "alle sporten · "}
                  {daysLeft >= 0 ? `nog ${daysLeft} dagen` : "afgelopen"}
                </div>
                <div style={{ background: "var(--surface-2)", borderRadius: 8, height: 10, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--garmin)" : "var(--accent)" }} />
                </div>
                <div className="readout" style={{ fontSize: 13 }}>
                  {current.toFixed(1)} / {target.toFixed(1)} {unit} ({pct}%)
                </div>
              </div>
            );
          })}
        </div>
      )}

      {syncResult && (
        <pre style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, fontSize: 12, color: "var(--text-dim)", overflowX: "auto", marginBottom: 24 }}>
          {JSON.stringify(syncResult, null, 2)}
        </pre>
      )}

      <h2 className="card-title" style={{ marginBottom: 12 }}>Alle activiteiten</h2>
      {loading ? (
        <p className="empty">Laden...</p>
      ) : activities.length === 0 ? (
        <p className="empty">Nog geen activiteiten. Koppel Polar en/of Strava op de <a href="/">homepage</a> en klik daarna op &ldquo;sync nu&rdquo;.</p>
      ) : (
        <div className="activity-list">
          {activities.map((a) => (
            <div className="activity-row" key={`${a.provider}-${a.id}`}>
              <span className={`dot ${a.provider === "polar" ? "polar" : "garmin"}`} />
              <div>
                <div className="activity-sport">{a.sport || a.source_sport || "activiteit"}</div>
                <div className="activity-date">{fmtDate(a.start_time)}</div>
              </div>
              <div className="readout hide-mobile">{fmtDistance(a.distance_m)}</div>
              <div className="readout hide-mobile">{fmtDuration(a.duration_s)}</div>
              <div className="readout hide-mobile">{a.avg_hr ? `${Math.round(a.avg_hr)} bpm` : "–"}</div>
              <div className="readout">{a.training_load ? Math.round(a.training_load) : "–"}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
