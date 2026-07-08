# TrainHub

Eén dashboard voor je Garmin Edge 540 (via Strava-sync) en Polar Vantage V3 (via AccessLink).

## Eenmalige setup

### 1. Database
Voeg een Postgres database toe aan je Vercel-project (Project → Storage → Create Database →
Postgres, of koppel je eigen Neon/Supabase). Zet de connection string als env var `DATABASE_URL`.
Draai daarna eenmalig `schema.sql` tegen die database (via de Vercel Postgres query-tab, of
`psql "$DATABASE_URL" -f schema.sql`).

### 2. Polar AccessLink
1. Ga naar https://admin.polaraccesslink.com en log in met je Polar Flow-account.
2. Maak een nieuwe client aan.
3. Redirect URL: `https://<jouw-vercel-domein>/api/auth/polar/callback`
4. Zet `POLAR_CLIENT_ID` en `POLAR_CLIENT_SECRET` als env vars in Vercel.

### 3. Strava API app
1. Ga naar https://www.strava.com/settings/api
2. Maak een app aan. Authorization Callback Domain: `<jouw-vercel-domein>` (zonder https://)
3. Zet `STRAVA_CLIENT_ID` en `STRAVA_CLIENT_SECRET` als env vars in Vercel.
4. Zorg dat je Garmin Edge 540 automatisch naar Strava synct: Garmin Connect app →
   instellingen → partnerapps/koppelingen → Strava → aanzetten.

### 4. Redeploy
Na het toevoegen van de env vars: opnieuw deployen zodat ze actief worden.

## Gebruik
- Ga naar `/` en klik "Koppel Polar Flow" en "Koppel Strava".
- Ga naar `/dashboard` en klik "sync nu" om data op te halen.
- Voor automatische sync kun je later een Vercel Cron Job toevoegen die periodiek
  `POST /api/sync` aanroept.
