"use client";

import { useState } from "react";
import { parseTcx, parseGpx } from "../../lib/importParsers";

export default function ImportPage() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function handleUpload() {
    if (!files.length) return;
    setBusy(true);
    setResult(null);

    const allActivities = [];
    const parseErrors = [];

    for (const file of files) {
      try {
        const text = await file.text();
        const name = file.name.toLowerCase();
        if (name.endsWith(".tcx")) {
          allActivities.push(...parseTcx(text));
        } else if (name.endsWith(".gpx")) {
          allActivities.push(...parseGpx(text));
        } else {
          parseErrors.push(`${file.name}: onbekend bestandstype (alleen .tcx/.gpx)`);
        }
      } catch (e) {
        parseErrors.push(`${file.name}: ${e.message}`);
      }
    }

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activities: allActivities }),
      });
      const data = await res.json();
      setResult({ ...data, errors: [...(data.errors || []), ...parseErrors] });
    } catch (e) {
      setResult({ error: e.message, errors: parseErrors });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <div className="eyebrow">import</div>
      <h1 className="hero" style={{ fontSize: "32px" }}>
        Oude trainingen importeren
      </h1>
      <p className="lede">
        Exporteer je oude sessies als <strong>.TCX</strong> (aanbevolen, bevat HR en
        calorieën) of <strong>.GPX</strong> &mdash; vanuit Polar Flow via een training
        &rarr; menu (⋯) &rarr; Export, of vanuit Garmin Connect via een activiteit &rarr;
        instellingen-tandwiel &rarr; Export TCX. Bestanden worden in je browser verwerkt
        en pas daarna als samenvatting verstuurd, dus ook grote Garmin-exports werken.
      </p>

      <div className="connect-card" style={{ maxWidth: 480 }}>
        <input
          type="file"
          accept=".tcx,.gpx"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
        {files.length > 0 && (
          <div className="card-desc">{files.length} bestand(en) geselecteerd</div>
        )}
        <button className="btn primary" onClick={handleUpload} disabled={busy || !files.length}>
          {busy ? "bezig..." : "Uploaden en importeren"}
        </button>
      </div>

      {result && (
        <pre
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: 14,
            fontSize: 12,
            color: "var(--text-dim)",
            overflowX: "auto",
            marginTop: 24,
            maxWidth: 600,
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      <p style={{ marginTop: 32 }}>
        <a className="btn" href="/dashboard">
          Naar dashboard →
        </a>
      </p>
    </main>
  );
}
