import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  const invalidUrl = new URL("/convite-invalido", request.url);
  if (!tokenHash || tokenHash.length > 512 || type !== "invite") {
    return NextResponse.redirect(invalidUrl);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    return NextResponse.redirect(invalidUrl);
  }

  const destination = new URL("/primeiro-acesso", request.url);
  let response = NextResponse.redirect(destination);

  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.redirect(destination);
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers ?? {}).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "invite",
  });

  if (error) {
    return NextResponse.redirect(invalidUrl);
  }

  // The invitation is not accepted unless the trusted server-side marker
  // has already been provisioned by the invitation workflow (#92).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.first_access_pending !== true) {
    await supabase.auth.signOut();
    return NextResponse.redirect(invalidUrl);
  }

  return response;
}
