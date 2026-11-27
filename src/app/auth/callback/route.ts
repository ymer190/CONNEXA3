import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // Invite tokens must arrive in the URL fragment at /confirmar-convite.
  // A query-string token would be sent to the server and may enter access logs.
  // Reject this legacy callback path rather than accepting or forwarding secrets.
  if (request.nextUrl.searchParams.has("token_hash") || request.nextUrl.searchParams.has("type")) {
    return NextResponse.redirect(new URL("/convite-invalido", request.url));
  }

  return NextResponse.redirect(new URL("/confirmar-convite", request.url));
}
