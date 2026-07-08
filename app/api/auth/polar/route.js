import { NextResponse } from "next/server";
import { getPolarAuthorizeUrl } from "../../../../lib/polar";

export async function GET(request) {
  const redirectUri = `${new URL(request.url).origin}/api/auth/polar/callback`;
  const url = getPolarAuthorizeUrl(redirectUri);
  return NextResponse.redirect(url);
}
