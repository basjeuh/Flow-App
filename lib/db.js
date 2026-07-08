import { Pool } from "pg";

let pool;

export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL ontbreekt. Zet deze env var in je Vercel project (Storage > Postgres, of je eigen Neon/Supabase connection string)."
      );
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function query(text, params) {
  const p = getPool();
  return p.query(text, params);
}

export async function saveTokens(provider, { accessToken, refreshToken, expiresAt, providerUserId }) {
  await query(
    `insert into oauth_tokens (provider, access_token, refresh_token, expires_at, provider_user_id, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (provider) do update set
       access_token = excluded.access_token,
       refresh_token = coalesce(excluded.refresh_token, oauth_tokens.refresh_token),
       expires_at = excluded.expires_at,
       provider_user_id = coalesce(excluded.provider_user_id, oauth_tokens.provider_user_id),
       updated_at = now()`,
    [provider, accessToken, refreshToken || null, expiresAt || null, providerUserId || null]
  );
}

export async function getTokens(provider) {
  const res = await query(`select * from oauth_tokens where provider = $1`, [provider]);
  return res.rows[0] || null;
}

export async function upsertActivity(a) {
  await query(
    `insert into activities
      (provider, external_id, sport, source_sport, start_time, duration_s, distance_m,
       avg_hr, max_hr, avg_speed_ms, elevation_gain_m, calories, training_load, raw)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (provider, external_id) do update set
       sport = excluded.sport,
       source_sport = excluded.source_sport,
       start_time = excluded.start_time,
       duration_s = excluded.duration_s,
       distance_m = excluded.distance_m,
       avg_hr = excluded.avg_hr,
       max_hr = excluded.max_hr,
       avg_speed_ms = excluded.avg_speed_ms,
       elevation_gain_m = excluded.elevation_gain_m,
       calories = excluded.calories,
       training_load = excluded.training_load,
       raw = excluded.raw`,
    [
      a.provider,
      a.external_id,
      a.sport,
      a.source_sport,
      a.start_time,
      a.duration_s,
      a.distance_m,
      a.avg_hr,
      a.max_hr,
      a.avg_speed_ms,
      a.elevation_gain_m,
      a.calories,
      a.training_load,
      a.raw ? JSON.stringify(a.raw) : null,
    ]
  );
}

export async function logSync(provider, status, detail) {
  await query(`insert into sync_log (provider, status, detail) values ($1,$2,$3)`, [
    provider,
    status,
    detail || null,
  ]);
}
