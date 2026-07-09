// Polar AccessLink integratie.
// Clients aangemaakt via admin.polaraccesslink.com horen bij het "klassieke"
// AccessLink OAuth-systeem:
//   - Autorisatie: flow.polar.com
//   - Token-uitwisseling: polarremote.com
//   - Data: www.polaraccesslink.com/v3/... (transactie-gebaseerd)
//
// (Er bestaat ook een nieuwer auth.polar.com/v4-systeem in de officiële docs,
// maar dat hoort bij een ander type client-registratie en werkt niet met
// clients die via admin.polaraccesslink.com zijn aangemaakt.)

const AUTHORIZE_URL = "https://flow.polar.com/oauth2/authorization";
const TOKEN_URL = "https://polarremote.com/v2/oauth2/token";
const API_BASE = "https://www.polaraccesslink.com/v3";

const SCOPE = "accesslink.read_all";

export function getPolarAuthorizeUrl(redirectUri, state) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.POLAR_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: SCOPE,
  });
  if (state) params.set("state", state);
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangePolarCode(code, redirectUri) {
  const basicAuth = Buffer.from(
    `${process.env.POLAR_CLIENT_ID}:${process.env.POLAR_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error(`Polar token exchange mislukt: ${res.status} ${await res.text()}`);
  }
  return res.json(); // { access_token, x_user_id, token_type, expires_in }
}

// Verplichte stap na de eerste koppeling: koppelt de Polar-gebruiker aan onze client.
// 409 (al geregistreerd) negeren we.
export async function registerPolarUser(accessToken, memberId) {
  const res = await fetch(`${API_BASE}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ "member-id": memberId }),
  });
  if (res.status !== 200 && res.status !== 201 && res.status !== 409) {
    throw new Error(`Polar user-registratie mislukt: ${res.status} ${await res.text()}`);
  }
}

// Transactie-model: open een transactie, haal de exercises op die erin zitten,
// en commit daarna zodat dezelfde data niet nogmaals terugkomt.
export async function fetchNewPolarExercises(accessToken, polarUserId) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };

  const openRes = await fetch(`${API_BASE}/users/${polarUserId}/exercise-transactions`, {
    method: "POST",
    headers,
  });

  if (openRes.status === 204) return []; // geen nieuwe data
  if (!openRes.ok) {
    throw new Error(`Polar transactie openen mislukt: ${openRes.status} ${await openRes.text()}`);
  }

  const { "transaction-id": transactionId, "resource-uri": txUri } = await openRes.json();

  const listRes = await fetch(
    txUri || `${API_BASE}/users/${polarUserId}/exercise-transactions/${transactionId}`,
    { headers }
  );
  if (!listRes.ok) {
    throw new Error(`Polar transactie-lijst mislukt: ${listRes.status}`);
  }
  const { exercises = [] } = await listRes.json();

  const results = [];
  for (const exerciseUri of exercises) {
    const exRes = await fetch(exerciseUri, { headers });
    if (exRes.ok) results.push(await exRes.json());
  }

  await fetch(`${API_BASE}/users/${polarUserId}/exercise-transactions/${transactionId}`, {
    method: "PUT",
    headers,
  });

  return results;
}

export function normalizePolarExercise(ex) {
  const hr = ex["heart-rate"] || {};
  return {
    provider: "polar",
    external_id: String(ex.id || ex["upload-time"] || ex["start-time"]),
    sport: (ex.sport || "").toLowerCase() || null,
    source_sport: ex.sport || null,
    start_time: ex["start-time"] || ex.start_time,
    duration_s: parseIsoDuration(ex.duration),
    distance_m: ex.distance ?? null,
    avg_hr: hr.average ?? null,
    max_hr: hr.maximum ?? null,
    avg_speed_ms: null,
    elevation_gain_m: null,
    calories: ex.calories ?? null,
    training_load: ex["training-load"] ?? ex["training-load-pro"]?.["cardio-load"] ?? null,
    running_index: ex["running-index"] ?? null,
    raw: ex,
  };
}

function parseIsoDuration(iso) {
  if (!iso) return null;
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(iso);
  if (!match) return null;
  const [, h, m, s] = match;
  return Number(h || 0) * 3600 + Number(m || 0) * 60 + Number(s || 0);
}
