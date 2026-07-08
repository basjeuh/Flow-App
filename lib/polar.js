// Polar AccessLink integratie.
// Docs: https://www.polar.com/polar-api-v4/  en  https://github.com/polarofficial/accesslink-example-python
//
// OAuth (v4): auth.polar.com
// Data (v3 REST, nog steeds actueel): www.polaraccesslink.com

const AUTH_BASE = "https://auth.polar.com";
const API_BASE = "https://www.polaraccesslink.com/v3";

export function getPolarAuthorizeUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id: process.env.POLAR_CLIENT_ID,
    response_type: "code",
    scope: "accesslink.read_all",
    redirect_uri: redirectUri,
    state: state || "",
  });
  return `${AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

export async function exchangePolarCode(code, redirectUri) {
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
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error(`Polar token exchange mislukt: ${res.status} ${await res.text()}`);
  }
  return res.json(); // { access_token, x_user_id, ... }
}

// Moet één keer per gebruiker na het koppelen: registreert de user bij jouw AccessLink-client.
// Geeft geen fout als de user al geregistreerd is (409), dat negeren we.
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

// Haalt nieuwe exercises op via het transactie-model, en commit de transactie na afloop.
export async function fetchNewPolarExercises(accessToken, polarUserId) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };

  const openRes = await fetch(`${API_BASE}/users/${polarUserId}/exercise-transactions`, {
    method: "POST",
    headers,
  });

  if (openRes.status === 204) {
    return []; // geen nieuwe data
  }
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
    if (exRes.ok) {
      results.push(await exRes.json());
    }
  }

  // Commit: markeert transactie als verwerkt zodat dezelfde data niet nogmaals terugkomt.
  await fetch(`${API_BASE}/users/${polarUserId}/exercise-transactions/${transactionId}`, {
    method: "PUT",
    headers,
  });

  return results;
}

// Normaliseert een Polar exercise-object naar ons unified activity-model.
export function normalizePolarExercise(ex) {
  const hr = ex["heart-rate"] || {};
  return {
    provider: "polar",
    external_id: String(ex.id || ex["upload-time"] || ex["start-time"]),
    sport: (ex.sport || "").toLowerCase() || null,
    source_sport: ex.sport || null,
    start_time: ex["start-time"] || ex["start_time"],
    duration_s: parsePolarDuration(ex.duration),
    distance_m: ex.distance ?? null,
    avg_hr: hr.average ?? null,
    max_hr: hr.maximum ?? null,
    avg_speed_ms: null,
    elevation_gain_m: null,
    calories: ex.calories ?? null,
    training_load: ex["training-load"] ?? ex["training-load-pro"]?.["cardio-load"] ?? null,
    raw: ex,
  };
}

// Polar geeft duration als ISO 8601 duration (bv "PT1H2M10S")
function parsePolarDuration(iso) {
  if (!iso) return null;
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(iso);
  if (!match) return null;
  const [, h, m, s] = match;
  return (Number(h || 0) * 3600) + (Number(m || 0) * 60) + Number(s || 0);
}
