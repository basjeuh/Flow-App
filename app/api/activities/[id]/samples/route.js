import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { query } from "../../../../../lib/db";

export async function GET(request, { params }) {
  try {
    const res = await query(`select samples from activities where id = $1`, [params.id]);
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
    }
    return NextResponse.json(
      { samples: res.rows[0].samples || [] },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
