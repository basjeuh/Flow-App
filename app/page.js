export default function Home() {
  return (
    <main className="wrap">
      <div className="eyebrow">TrainHub · unified training data</div>
      <h1 className="hero">Eén logboek voor fiets en hardlopen.</h1>
      <p className="lede">
        Je Garmin Edge 540 en Polar Vantage V3 praten niet met elkaar. TrainHub haalt
        beide binnen &mdash; Polar rechtstreeks via AccessLink, Garmin via de Strava-sync
        &mdash; en zet alles in één tijdlijn.
      </p>

      <div className="connect-grid">
        <div className="connect-card">
          <div className="card-title">
            <span className="dot polar" />
            Polar
          </div>
          <div className="card-desc">
            Koppel je Polar Flow-account. Trainingen, HR-zones en cardio load komen
            rechtstreeks binnen via AccessLink.
          </div>
          <a className="btn primary" href="/api/auth/polar">
            Koppel Polar Flow
          </a>
        </div>

        <div className="connect-card">
          <div className="card-title">
            <span className="dot garmin" />
            Garmin (via Strava)
          </div>
          <div className="card-desc">
            Zorg dat je Edge 540 automatisch naar Strava synct (Garmin Connect &rarr;
            instellingen &rarr; partnerapps), koppel daarna hier je Strava-account.
          </div>
          <a className="btn primary" href="/api/auth/strava">
            Koppel Strava
          </a>
        </div>
      </div>

      <p style={{ marginTop: 40 }}>
        <a className="btn" href="/dashboard">
          Naar dashboard →
        </a>
      </p>
    </main>
  );
}
