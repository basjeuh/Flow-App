import { NextResponse } from "next/server";
import { deleteGoal } from "../../../../lib/db";

export async function DELETE(request, { params }) {
  try {
    await deleteGoal(params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
