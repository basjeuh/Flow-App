-- TrainHub schema
-- Draai dit één keer tegen je Postgres database (Vercel Postgres / Neon / Supabase, maakt niet uit).

create table if not exists oauth_tokens (
  provider text primary key,               -- 'polar' | 'strava'
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  provider_user_id text,                    -- polar member-id / strava athlete id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists activities (
  id bigserial primary key,
  provider text not null,                   -- 'polar' | 'strava'
  external_id text not null,                -- id van de bron, voor dedup
  sport text,                               -- genormaliseerd sporttype
  source_sport text,                        -- origineel sporttype-label van de bron
  start_time timestamptz not null,
  duration_s integer,
  distance_m numeric,
  avg_hr numeric,
  max_hr numeric,
  avg_speed_ms numeric,
  elevation_gain_m numeric,
  calories numeric,
  training_load numeric,                    -- polar cardio load / garmin training effect indien beschikbaar
  running_index numeric,                    -- polar's hardloop-fitnessindicator (alleen bij live AccessLink-sync)
  laps jsonb,                                -- per-ronde/per-km splits: [{distance_m, duration_s, avg_hr, max_hr, calories}]
  samples jsonb,                             -- per-seconde tijdreeks: [{t, dist, hr, cadence, watts}]
  raw jsonb,                                -- volledige originele payload, voor latere uitbreiding
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);

create index if not exists activities_start_time_idx on activities (start_time desc);

create table if not exists sync_log (
  id bigserial primary key,
  provider text not null,
  status text not null,                     -- 'ok' | 'error'
  detail text,
  created_at timestamptz not null default now()
);

-- Vrij instelbare doelen, bv. "500 km hardlopen voor 1 oktober" of
-- "20 keer fietsen deze maand". sport = null betekent: alle sporten samen.
create table if not exists goals (
  id bigserial primary key,
  title text not null,
  sport text,                                -- null = alle sporten
  metric text not null,                       -- 'distance_m' | 'duration_s' | 'count'
  target_value numeric not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);
