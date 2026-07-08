import { NextResponse } from "next/server";
import { exchangePolarCode } from "../../../../../lib/polar";
import { saveTokens } from "../../../../../lib/db";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${url.origin}/?error=polar_${error}`);
  }
  if (!code) {
    return NextResponse.redirect(`${url.origin}/?error=polar_no_code`);
  }

  const redirectUri = `${url.origin}/api/auth/polar/callback`;

  try {
    const token = await exchangePolarCode(code, redirectUri);

    await saveTokens("polar", {
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt: new Date(Date.now() + (token.expires_in || 43000) * 1000).toISOString(),
      providerUserId: null,
    });

    return NextResponse.redirect(`${url.origin}/dashboard?connected=polar`);
  } catch (e) {
    return NextResponse.redirect(`${url.origin}/?error=${encodeURIComponent(e.message)}`);
  }
}
