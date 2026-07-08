import { NextResponse } from "next/server";
import { listGoals, createGoal, getGoalProgress } from "../../../lib/db";

const ALLOWED_METRICS = ["distance_m", "duration_s", "count"];

export async function GET() {
  try {
    const goals = await listGoals();
    const withProgress = await Promise.all(
      goals.map(async (g) => {
        const current = await getGoalProgress(
          g.sport,
          g.metric,
          g.start_date,
          g.end_date
        );
        return { ...g, current };
      })
    );
    return NextResponse.json({ goals: withProgress });
  } catch (e) {
    console.error("GOALS_GET_ERROR", e.message, e.stack);
    return NextResponse.json({ error: e.message, goals: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { title, sport, metric, target_value, start_date, end_date } = body;

    if (!title || !metric || !target_value || !start_date || !end_date) {
      return NextResponse.json({ error: "Vul alle verplichte velden in" }, { status: 400 });
    }
    if (!ALLOWED_METRICS.includes(metric)) {
      return NextResponse.json({ error: "Ongeldige metric" }, { status: 400 });
    }

    const goal = await createGoal({
      title,
      sport: sport || null,
      metric,
      target_value: Number(target_value),
      start_date,
      end_date,
    });
    return NextResponse.json({ goal });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
