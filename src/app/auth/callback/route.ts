import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (!tokenHash || tokenHash.length > 512 || type !== "invite") {
    return NextResponse.redirect(new URL("/convite-invalido", request.url));
  }

  // Do not consume the one-time invite token on GET: email security scanners
  // may prefetch links. Verification happens only after the user confirms.
  const confirmationUrl = new URL("/confirmar-convite", request.url);
  confirmationUrl.searchParams.set("token_hash", tokenHash);
  confirmationUrl.searchParams.set("type", "invite");
  return NextResponse.redirect(confirmationUrl);
}
