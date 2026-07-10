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

// Simpele lap- en trackpoint-extractie uit TCX-XML zonder externe dependency
// (polar.js draait server-side; we willen hier geen extra parser-lib-afhankelijkheid
// voor een paar regex-matches). Elke <Lap>-tag wordt één ronde/kilometer-split,
// elke <Trackpoint> een punt in de per-seconde tijdreeks (tempo/HR/cadans/vermogen).
function extractLapsAndSamplesFromTcx(xmlText) {
  const laps = [];
  const samples = [];
  const activityIdMatch = xmlText.match(/<Id>([^<]+)<\/Id>/);
  const activityStart = activityIdMatch ? new Date(activityIdMatch[1]).getTime() : null;

  const lapMatches = xmlText.match(/<Lap[^>]*>[\s\S]*?<\/Lap>/g) || [];
  for (const lapXml of lapMatches) {
    const num = (re, src) => {
      const m = (src || lapXml).match(re);
      return m ? Number(m[1]) : null;
    };
    laps.push({
      duration_s: num(/<TotalTimeSeconds>([\d.]+)<\/TotalTimeSeconds>/),
      distance_m: num(/<DistanceMeters>([\d.]+)<\/DistanceMeters>/),
      calories: num(/<Calories>(\d+)<\/Calories>/),
      avg_hr: num(/<AverageHeartRateBpm>\s*<Value>(\d+)<\/Value>/),
      max_hr: num(/<MaximumHeartRateBpm>\s*<Value>(\d+)<\/Value>/),
    });

    if (activityStart) {
      const tpMatches = lapXml.match(/<Trackpoint>[\s\S]*?<\/Trackpoint>/g) || [];
      for (const tp of tpMatches) {
        const timeMatch = tp.match(/<Time>([^<]+)<\/Time>/);
        if (!timeMatch) continue;
        samples.push({
          t: Math.round((new Date(timeMatch[1]).getTime() - activityStart) / 1000),
          dist: num(/<DistanceMeters>([\d.]+)<\/DistanceMeters>/, tp),
          hr: num(/<HeartRateBpm>\s*<Value>(\d+)<\/Value>/, tp),
          cadence: num(/<Cadence>(\d+)<\/Cadence>/, tp),
          watts: num(/<(?:\w+:)?Watts>([\d.]+)<\/(?:\w+:)?Watts>/, tp),
          speed_ms: num(/<(?:\w+:)?Speed>([\d.]+)<\/(?:\w+:)?Speed>/, tp),
        });
      }
    }
  }
  return { laps, samples };
}

// Haalt de TCX-sub-resource van één exercise op (moet binnen dezelfde,
// nog-niet-gecommitte transactie gebeuren) en geeft rondes + tijdreeks terug.
export async function fetchExerciseLaps(accessToken, exerciseUri) {
  try {
    const res = await fetch(`${exerciseUri}/tcx`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.garmin.tcx+xml" },
    });
    if (!res.ok) return { laps: [], samples: [] };
    const text = await res.text();
    return extractLapsAndSamplesFromTcx(text);
  } catch {
    return { laps: [], samples: [] };
  }
}

// Ontdekt welke sample-types (HR/snelheid/cadans/power/...) beschikbaar zijn
// voor één exercise, en haalt van elk type een korte proef (eerste ~20 waarden)
// op zodat we het exacte dataformaat kunnen zien. Moet binnen dezelfde,
// nog-niet-gecommitte transactie gebeuren — net als de TCX-laps hierboven.
export async function fetchExerciseSampleProbe(accessToken, exerciseUri) {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  try {
    const listRes = await fetch(`${exerciseUri}/samples`, { headers });
    if (!listRes.ok) return { error: `${listRes.status} ${await listRes.text()}` };
    const available = await listRes.json();

    const types = Array.isArray(available) ? available : available["available-samples"] || [];
    const probes = {};
    for (const t of types.slice(0, 8)) {
      const uri = typeof t === "string" ? `${exerciseUri}/samples/${t}` : t["resource-uri"];
      if (!uri) continue;
      try {
        const dRes = await fetch(uri, { headers });
        if (dRes.ok) {
          const data = await dRes.json();
          probes[typeof t === "string" ? t : t["sample-type"] || uri] = {
            keys: Object.keys(data),
            preview: JSON.stringify(data).slice(0, 400),
          };
        }
      } catch (e) {
        probes[String(t)] = { error: e.message };
      }
    }
    return { available_types_raw: types, probes };
  } catch (e) {
    return { error: e.message };
  }
}

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

// Niet-transactionele endpoints: deze geven toegang tot elke exercise van de
// laatste 30 dagen, herhaaldelijk opvraagbaar (in tegenstelling tot de
// transactie-gebaseerde /exercise-transactions/... endpoints hierboven, die
// maar één keer per activiteit "geopend" kunnen worden).
export async function listRecentExercises(accessToken) {
  const res = await fetch(`${API_BASE}/exercises`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Kon exercises niet ophalen: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getAvailableSamples(accessToken, exerciseId) {
  const res = await fetch(`${API_BASE}/exercises/${exerciseId}/samples`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Kon samples niet ophalen: ${res.status} ${await res.text()}`);
  return res.json();
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
    if (exRes.ok) {
      const exercise = await exRes.json();
      const { laps, samples } = await fetchExerciseLaps(accessToken, exerciseUri);
      const sampleProbe = await fetchExerciseSampleProbe(accessToken, exerciseUri);
      results.push({ ...exercise, _laps: laps, _samples: samples, _samples_probe: sampleProbe });
    }
  }

  await fetch(`${API_BASE}/users/${polarUserId}/exercise-transactions/${transactionId}`, {
    method: "PUT",
    headers,
  });

  return results;
}

export function normalizePolarExercise(ex) {
  const hr = ex["heart-rate"] || {};
  const { _samples, _laps, _samples_probe, ...rawWithoutBulk } = ex;
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
    laps: _laps && _laps.length > 0 ? _laps : null,
    samples: _samples && _samples.length > 0 ? _samples : null,
    raw: { ...rawWithoutBulk, _samples_probe },
  };
}

function parseIsoDuration(iso) {
  if (!iso) return null;
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(iso);
  if (!match) return null;
  const [, h, m, s] = match;
  return Number(h || 0) * 3600 + Number(m || 0) * 60 + Number(s || 0);
}
