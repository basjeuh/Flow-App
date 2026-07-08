import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { upsertActivity } from "../../../lib/db";

// Verwacht al vooraf (client-side, in de browser) geparste activiteiten,
// niet de ruwe TCX/GPX-bestanden zelf. Dit voorkomt dat grote Garmin-exports
// tegen Vercel's request-bodylimiet aanlopen.
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

    return NextResponse.json({ imported, errors });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
