import { NextResponse } from "next/server";
import { getTokens, saveTokens, upsertActivity, logSync } from "../../../lib/db";
import { fetchNewPolarExercises, normalizePolarExercise } from "../../../lib/polar";
import {
  fetchStravaActivities,
  normalizeStravaActivity,
  refreshStravaToken,
} from "../../../lib/strava";

export const maxDuration = 60;

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
    const polarTokens = await getTokens("polar");
    if (polarTokens) {
      const exercises = await fetchNewPolarExercises(
        polarTokens.access_token,
        polarTokens.provider_user_id
      );
      for (const ex of exercises) {
        await upsertActivity(normalizePolarExercise(ex));
      }
      results.polar = { new_activities: exercises.length };
      await logSync("polar", "ok", `${exercises.length} nieuwe activiteiten`);
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

  console.log("SYNC_RESULT", JSON.stringify(results));
  return NextResponse.json(results);
}
