"use client";

import { useState } from "react";

export default function ImportPage() {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function handleUpload() {
    if (!files.length) return;
    setBusy(true);
    setResult(null);
    try {
      const formData = new FormData();
      for (const f of files) formData.append("files", f);
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ error: e.message });
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
        calorieën) of <strong>.GPX</strong> vanuit Polar Flow: open een training in de
        Flow-webservice &rarr; menu (⋯) &rarr; Export &rarr; TCX. Upload hier meerdere
        bestanden tegelijk.
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
