import { NextResponse } from "next/server";
import { getTokens, saveTokens, upsertActivity, logSync } from "../../../lib/db";
import {
  fetchTrainingSessions,
  normalizePolarSession,
  refreshPolarToken,
} from "../../../lib/polar";
import {
  fetchStravaActivities,
  normalizeStravaActivity,
  refreshStravaToken,
} from "../../../lib/strava";

export const maxDuration = 60;

// Vercel Cron roept endpoints aan met GET; de dashboard-knop gebruikt POST.
// Beide doen hetzelfde.
export async function GET() {
  return runSync();
}

export async function POST() {
  return runSync();
}

async function runSync() {
  const results = { polar: null, strava: null };

  // --- Polar ---
  try {
    let polarTokens = await getTokens("polar");
    if (polarTokens) {
      // Polar v4 access tokens zijn ~12 uur geldig; ververs indien nodig.
      if (polarTokens.expires_at && new Date(polarTokens.expires_at) < new Date()) {
        if (!polarTokens.refresh_token) {
          throw new Error("Polar-token verlopen en geen refresh_token beschikbaar, opnieuw koppelen nodig.");
        }
        const refreshed = await refreshPolarToken(polarTokens.refresh_token);
        await saveTokens("polar", {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token || polarTokens.refresh_token,
          expiresAt: new Date(Date.now() + (refreshed.expires_in || 43000) * 1000).toISOString(),
          providerUserId: null,
        });
        polarTokens = await getTokens("polar");
      }

      const sessions = await fetchTrainingSessions(polarTokens.access_token);
      for (const session of sessions) {
        await upsertActivity(normalizePolarSession(session));
      }
      results.polar = { new_activities: sessions.length };
      await logSync("polar", "ok", `${sessions.length} trainingssessies`);
    } else {
      results.polar = { skipped: "niet gekoppeld" };
    }
  } catch (e) {
    results.polar = { error: e.message };
    await logSync("polar", "error", e.message);
  }

  // --- Strava ---
  try {
    let stravaTokens = await getTokens("strava");
    if (stravaTokens) {
      // Ververs token indien nodig (Strava tokens verlopen na 6 uur)
      if (stravaTokens.expires_at && new Date(stravaTokens.expires_at) < new Date()) {
        const refreshed = await refreshStravaToken(stravaTokens.refresh_token);
        await saveTokens("strava", {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          expiresAt: new Date(refreshed.expires_at * 1000).toISOString(),
          providerUserId: stravaTokens.provider_user_id,
        });
        stravaTokens = await getTokens("strava");
      }

      // Haal alles op sinds de laatste keer syncen (met wat marge).
      // Bij de allereerste sync pakken we een ruime historie (~2 jaar).
      const afterUnix = Math.floor(new Date(stravaTokens.updated_at).getTime() / 1000) - 86400 * 730;
      const activities = await fetchStravaActivities(stravaTokens.access_token, afterUnix);
      for (const act of activities) {
        await upsertActivity(normalizeStravaActivity(act));
      }
      results.strava = { new_activities: activities.length };
      await logSync("strava", "ok", `${activities.length} activiteiten gesynchroniseerd`);
    } else {
      results.strava = { skipped: "niet gekoppeld" };
    }
  } catch (e) {
    results.strava = { error: e.message };
    await logSync("strava", "error", e.message);
  }

  return NextResponse.json(results);
}
