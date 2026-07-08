import { NextResponse } from "next/server";
import { exchangePolarCode, registerPolarUser } from "../../../../../lib/polar";
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
    const memberId = `bas-${token.x_user_id}`;
    await registerPolarUser(token.access_token, memberId);

    await saveTokens("polar", {
      accessToken: token.access_token,
      refreshToken: null, // Polar access tokens verlopen niet
      expiresAt: null,
      providerUserId: String(token.x_user_id),
    });

    return NextResponse.redirect(`${url.origin}/dashboard?connected=polar`);
  } catch (e) {
    return NextResponse.redirect(`${url.origin}/?error=${encodeURIComponent(e.message)}`);
  }
}
