import { randomBytes, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { classifyAuthFailure } from "@/lib/auth-flow.mjs";
import { buildRegisterDeviceSessionArgs } from "@/lib/device-session-rpc.mjs";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function newDeviceCredentials() {
  return { id: randomUUID(), secret: randomBytes(32).toString("base64url") };
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  let originIsValid = false;

  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      const expectedProtocol = forwardedProto
        ? `${forwardedProto.replace(/:$/, "")}:`
        : request.nextUrl.protocol;
      originIsValid =
        (originUrl.protocol === "http:" || originUrl.protocol === "https:") &&
        originUrl.host.toLowerCase() === host.toLowerCase() &&
        originUrl.protocol === expectedProtocol;
    } catch {
      originIsValid = false;
    }
  }

  if (!originIsValid) {
    return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  }
  let supabase: Awaited<ReturnType<typeof createClient>>;
  let user: { id: string } | null = null;
  try {
    supabase = await createClient();
    const result = await supabase.auth.getUser();
    if (classifyAuthFailure(result.error) === "unavailable") {
      return NextResponse.json({ error: "AUTH_SERVICE_UNAVAILABLE" }, { status: 503 });
    }
    user = result.data.user;
  } catch {
    return NextResponse.json({ error: "AUTH_SERVICE_UNAVAILABLE" }, { status: 503 });
  }
  if (!user) {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }

  let cookieStore: Awaited<ReturnType<typeof cookies>>;
  let requestHeaders: Awaited<ReturnType<typeof headers>>;
  try {
    cookieStore = await cookies();
    requestHeaders = await headers();
  } catch {
    return NextResponse.json({ error: "DEVICE_ENROLLMENT_UNAVAILABLE" }, { status: 503 });
  }
  const secure = process.env.NODE_ENV === "production";
  let credentials = {
    id: cookieStore.get("connexa-device-id")?.value ?? "",
    secret: cookieStore.get("connexa-device-secret")?.value ?? "",
  };

  if (!credentials.id || !credentials.secret) {
    credentials = newDeviceCredentials();
  }

  let data: string | null = null;
  let error: { message: string } | null = null;
  try {
    const result = await supabase.rpc("register_device_session", buildRegisterDeviceSessionArgs({
      deviceId: credentials.id,
      deviceSecret: credentials.secret,
      label: "Navegador",
      userAgent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null,
    }));
    data = result.data;
    error = result.error;
  } catch {
    return NextResponse.json({ error: "DEVICE_ENROLLMENT_UNAVAILABLE" }, { status: 503 });
  }

  if (
    error &&
    (error.message.includes("Revoked device") ||
      error.message.includes("Revoked device or session") ||
      error.message.includes("Device credential is invalid"))
  ) {
    // A device/session already bound to this Supabase session cannot be silently
    // replaced: device_sessions.session_id is unique. Require a fresh login.
    const response = NextResponse.json(
      { error: "DEVICE_REENROLLMENT_REQUIRED" },
      { status: 409 },
    );
    const clearOptions = {
      httpOnly: true,
      secure,
      sameSite: "strict" as const,
      path: "/",
      maxAge: 0,
    };
    response.cookies.set("connexa-device-id", "", clearOptions);
    response.cookies.set("connexa-device-secret", "", clearOptions);
    return response;
  }

  if (error || (data !== "approved" && data !== "pending")) {
    return NextResponse.json({ error: "DEVICE_ENROLLMENT_FAILED" }, { status: 503 });
  }

  const response = NextResponse.json({ status: data }, { status: 200 });
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
  response.cookies.set("connexa-device-id", credentials.id, cookieOptions);
  response.cookies.set("connexa-device-secret", credentials.secret, cookieOptions);
  return response;
}
