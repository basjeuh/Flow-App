import { NextResponse } from "next/server";
import { upsertActivity, query } from "../../../lib/db";

// Verwacht al vooraf (client-side, in de browser) geparste activiteiten,
// niet de ruwe TCX/GPX-bestanden zelf. Dit voorkomt dat grote Garmin-exports
// (met dichte GPS/HR-sampledata) tegen Vercel's request-bodylimiet aanlopen.
export async function POST(request) {
  try {
    const { activities } = await request.json();
    if (!Array.isArray(activities) || activities.length === 0) {
      return NextResponse.json({ error: "Geen activiteiten ontvangen" }, { status: 400 });
    }

    let imported = 0;
    const errors = [];
    for (const a of activities) {
      if (!a.start_time) {
        errors.push("Activiteit zonder starttijd overgeslagen");
        continue;
      }
      try {
        await upsertActivity(a);
        imported += 1;
      } catch (e) {
        errors.push(e.message);
      }
    }

    const countRes = await query(`select count(*)::int as n from activities`);
    return NextResponse.json({ imported, errors, total_rows_now: countRes.rows[0].n });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
