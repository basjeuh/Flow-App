import { NextResponse } from "next/server";
import { upsertActivity } from "../../../lib/db";
import { parseTcx, parseGpx } from "../../../lib/importParsers";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files");

    if (!files.length) {
      return NextResponse.json({ error: "Geen bestanden ontvangen" }, { status: 400 });
    }

    let imported = 0;
    const errors = [];

    for (const file of files) {
      try {
        const text = await file.text();
        const name = file.name.toLowerCase();
        let activities = [];

        if (name.endsWith(".tcx")) {
          activities = parseTcx(text);
        } else if (name.endsWith(".gpx")) {
          activities = parseGpx(text);
        } else {
          errors.push(`${file.name}: onbekend bestandstype (alleen .tcx/.gpx)`);
          continue;
        }

        for (const a of activities) {
          if (!a.start_time) {
            errors.push(`${file.name}: kon starttijd niet bepalen, overgeslagen`);
            continue;
          }
          await upsertActivity(a);
          imported += 1;
        }
      } catch (e) {
        errors.push(`${file.name}: ${e.message}`);
      }
    }

    return NextResponse.json({ imported, errors });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
