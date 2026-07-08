"use client";

import { useEffect, useState, useMemo } from "react";

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
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function Dashboard() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

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

  async function sync() {
    setSyncing(true);
    try {
      await fetch("/api/sync", { method: "POST" });
      await load();
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const thisWeek = activities.filter((a) => new Date(a.start_time) >= weekAgo);
    const totalKm = thisWeek.reduce((s, a) => s + (Number(a.distance_m) || 0), 0) / 1000;
    const totalTime = thisWeek.reduce((s, a) => s + (Number(a.duration_s) || 0), 0);
    const hrValues = activities.filter((a) => a.avg_hr).slice(0, 10);
    const avgHr = hrValues.length
      ? Math.round(hrValues.reduce((s, a) => s + Number(a.avg_hr), 0) / hrValues.length)
      : null;

    return {
      count: activities.length,
      weekKm: totalKm.toFixed(1),
      weekTime: fmtDuration(totalTime),
      avgHr: avgHr ?? "–",
    };
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
      <h1 className="hero" style={{ fontSize: "32px" }}>
        Trainingsoverzicht
      </h1>

      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">activiteiten</div>
          <div className="stat-value readout">{stats.count}</div>
        </div>
        <div className="stat">
          <div className="stat-label">km deze week</div>
          <div className="stat-value readout">{stats.weekKm}</div>
        </div>
        <div className="stat">
          <div className="stat-label">tijd deze week</div>
          <div className="stat-value readout">{stats.weekTime}</div>
        </div>
        <div className="stat">
          <div className="stat-label">gem. hr (laatste 10)</div>
          <div className="stat-value readout">{stats.avgHr}</div>
        </div>
      </div>

      {error && <p style={{ color: "var(--polar)" }}>Fout: {error}</p>}

      {loading ? (
        <p className="empty">Laden...</p>
      ) : activities.length === 0 ? (
        <p className="empty">
          Nog geen activiteiten. Koppel Polar en/of Strava op de <a href="/">homepage</a> en
          klik daarna op &ldquo;sync nu&rdquo;.
        </p>
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
