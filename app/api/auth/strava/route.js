import { NextResponse } from "next/server";
import { getStravaAuthorizeUrl } from "../../../../lib/strava";

export async function GET(request) {
  const redirectUri = `${new URL(request.url).origin}/api/auth/strava/callback`;
  const url = getStravaAuthorizeUrl(redirectUri);
  return NextResponse.redirect(url);
}
