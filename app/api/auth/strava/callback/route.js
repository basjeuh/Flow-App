import { NextResponse } from "next/server";
import { exchangeStravaCode } from "../../../../../lib/strava";
import { saveTokens } from "../../../../../lib/db";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${url.origin}/?error=strava_${error}`);
  }
  if (!code) {
    return NextResponse.redirect(`${url.origin}/?error=strava_no_code`);
  }

  try {
    const token = await exchangeStravaCode(code);

    await saveTokens("strava", {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(token.expires_at * 1000).toISOString(),
      providerUserId: String(token.athlete?.id || ""),
    });

    return NextResponse.redirect(`${url.origin}/dashboard?connected=strava`);
  } catch (e) {
    return NextResponse.redirect(`${url.origin}/?error=${encodeURIComponent(e.message)}`);
  }
}
