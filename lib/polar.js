// Polar AccessLink integratie (Dynamic API v4).
// Officiële docs: https://www.polar.com/polar-api-v4/
//
// Belangrijk verschil met oudere voorbeelden die je online vindt (v3):
// - OAuth draait via auth.polar.com
// - Data-endpoints draaien via www.polaraccesslink.com/v4/data/...
// - Geen aparte "user-registratie" stap nodig, en geen transactie-model:
//   gewoon directe GET-endpoints met een Bearer-token.
// - Access tokens zijn ca. 12 uur geldig; er is een refresh_token voor verlenging.

const AUTH_BASE = "https://auth.polar.com";
const API_BASE = "https://www.polaraccesslink.com/v4/data";

// Geldige v4 scopes (zie /polar-api-v4/ "Scopes"): training_sessions:read geeft
// toegang tot trainingssessies, wat we nodig hebben voor de unified activiteitenlijst.
const SCOPES = "training_sessions:read";

export function getPolarAuthorizeUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id: process.env.POLAR_CLIENT_ID,
    response_type: "code",
    scope: SCOPES,
    redirect_uri: redirectUri,
    state: state || "",
  });
  return `${AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

async function tokenRequest(bodyParams) {
  const basicAuth = Buffer.from(
    `${process.env.POLAR_CLIENT_ID}:${process.env.POLAR_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: bodyParams,
  });

  if (!res.ok) {
    throw new Error(`Polar token-aanvraag mislukt: ${res.status} ${await res.text()}`);
  }
  return res.json(); // { access_token, token_type, refresh_token, expires_in, scope, jti }
}

export async function exchangePolarCode(code, redirectUri) {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    })
  );
}

export async function refreshPolarToken(refreshToken) {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  );
}

// Haalt de lijst met trainingssessies op. We bewaren altijd de ruwe payload
// (raw), zodat als het exacte veldformaat afwijkt van onze aannames, er
// niets verloren gaat en we de mapping later kunnen verfijnen.
export async function fetchTrainingSessions(accessToken) {
  const res = await fetch(`${API_BASE}/training-sessions/list`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (res.status === 204) return [];
  if (!res.ok) {
    throw new Error(`Polar training-sessions ophalen mislukt: ${res.status} ${await res.text()}`);
  }

  const body = await res.json();
  // Defensief: de exacte sleutelnaam van de lijst in de response kan variëren.
  return body.trainingSessions || body.data || (Array.isArray(body) ? body : []);
}

export function normalizePolarSession(session) {
  const stats = session.statistics || session.exerciseStatistics || {};
  const startTime =
    session.startTime || session["start-time"] || session.start_time || session.created;

  return {
    provider: "polar",
    external_id: String(
      session.id || session.sessionId || session["training-session-id"] || startTime
    ),
    sport:
      (session.sport?.name || session.sportReference?.name || session.sport || "")
        .toString()
        .toLowerCase() || null,
    source_sport: session.sport?.name || session.sport || null,
    start_time: startTime,
    duration_s: parseIsoDuration(session.duration || stats.duration),
    distance_m: stats.distance ?? session.distance ?? null,
    avg_hr: stats.heartRateAverage ?? stats.averageHeartRate ?? null,
    max_hr: stats.heartRateMax ?? stats.maximumHeartRate ?? null,
    avg_speed_ms: null,
    elevation_gain_m: stats.ascent ?? null,
    calories: stats.calories ?? session.calories ?? null,
    training_load:
      session.trainingLoadReport?.cardioLoad ?? session.trainingLoad ?? null,
    raw: session,
  };
}

// Polar geeft duration vaak als ISO 8601 duration (bv "PT1H2M10S")
function parseIsoDuration(iso) {
  if (!iso) return null;
  if (typeof iso === "number") return iso; // al in seconden
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(iso);
  if (!match) return null;
  const [, h, m, s] = match;
  return Number(h || 0) * 3600 + Number(m || 0) * 60 + Number(s || 0);
}
