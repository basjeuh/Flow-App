import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { query } from "../../../lib/db";

export async function GET() {
  try {
    const res = await query(
      `select id, provider, sport, source_sport, start_time, duration_s, distance_m,
              avg_hr, max_hr, avg_speed_ms, elevation_gain_m, calories, training_load, running_index, laps, raw
       from activities
       order by start_time desc
       limit 500`
    );
    return NextResponse.json(
      { activities: res.rows },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json({ error: e.message, activities: [] }, { status: 500 });
  }
}
