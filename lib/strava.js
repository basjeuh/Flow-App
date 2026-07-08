// Strava integratie. Je Garmin Edge 540 kan automatisch naar Strava syncen
// (Garmin Connect > instellingen > partnerapps > Strava), waarna wij die
// activiteiten via de Strava API ophalen.
// Docs: https://developers.strava.com/docs/reference/

const AUTH_BASE = "https://www.strava.com/oauth";
const API_BASE = "https://www.strava.com/api/v3";

export function getStravaAuthorizeUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    approval_prompt: "auto",
    scope: "read,activity:read_all",
    state: state || "",
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

export async function exchangeStravaCode(code) {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token exchange mislukt: ${res.status} ${await res.text()}`);
  }
  return res.json(); // { access_token, refresh_token, expires_at, athlete: {...} }
}

export async function refreshStravaToken(refreshToken) {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token refresh mislukt: ${res.status} ${await res.text()}`);
  }
  return res.json(); // { access_token, refresh_token, expires_at }
}

// Haalt activiteiten op na een bepaalde timestamp (unix seconds), gepagineerd.
export async function fetchStravaActivities(accessToken, afterUnix) {
  const all = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
    });
    if (afterUnix) params.set("after", String(afterUnix));

    const res = await fetch(`${API_BASE}/athlete/activities?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Strava activities ophalen mislukt: ${res.status} ${await res.text()}`);
    }
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return all;
}

export function normalizeStravaActivity(act) {
  return {
    provider: "strava",
    external_id: String(act.id),
    sport: (act.sport_type || act.type || "").toLowerCase() || null,
    source_sport: act.sport_type || act.type || null,
    start_time: act.start_date,
    duration_s: act.moving_time ?? act.elapsed_time ?? null,
    distance_m: act.distance ?? null,
    avg_hr: act.average_heartrate ?? null,
    max_hr: act.max_heartrate ?? null,
    avg_speed_ms: act.average_speed ?? null,
    elevation_gain_m: act.total_elevation_gain ?? null,
    calories: act.calories ?? null,
    training_load: act.suffer_score ?? null,
    raw: act,
  };
}
