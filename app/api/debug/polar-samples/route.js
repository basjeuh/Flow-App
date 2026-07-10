import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { getTokens } from "../../../../lib/db";
import { listRecentExercises, getAvailableSamples } from "../../../../lib/polar";

// TIJDELIJK diagnose-endpoint om te zien welke sample-types (HR/snelheid/
// cadans/power/...) Polar daadwerkelijk aanbiedt voor jouw device. Wordt
// weer verwijderd zodra we weten wat er beschikbaar is.
export async function GET() {
  try {
    const tokens = await getTokens("polar");
    if (!tokens) return NextResponse.json({ error: "Polar niet gekoppeld" }, { status: 400 });

    const exercises = await listRecentExercises(tokens.access_token);
    if (!exercises.length) return NextResponse.json({ error: "Geen exercises in de laatste 30 dagen" });

    const latest = exercises[0];
    const samples = await getAvailableSamples(tokens.access_token, latest.id);

    return NextResponse.json({
      exercise_summary_keys: Object.keys(latest),
      exercise_id: latest.id,
      sport: latest.sport,
      start_time: latest["start-time"],
      available_samples: samples,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
