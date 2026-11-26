import { randomBytes, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { classifyAuthFailure, isSameOriginRequest } from "@/lib/auth-flow.mjs";
import { buildRegisterDeviceSessionArgs } from "@/lib/device-session-rpc.mjs";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function newDeviceCredentials() {
  return { id: randomUUID(), secret: randomBytes(32).toString("base64url") };
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request.headers.get("origin"), request.url)) {
    return NextResponse.json({ error: "SAME_ORIGIN_REQUIRED" }, { status: 403 });
  }

  let supabase: SupabaseClient;
  let user: User | null;
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (classifyAuthFailure(error) === "unavailable") {
      return NextResponse.json({ error: "AUTH_SERVICE_UNAVAILABLE" }, { status: 503 });
    }
    user = data.user;
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
  let isNewDevice = !credentials.id || !credentials.secret;
  if (isNewDevice) credentials = newDeviceCredentials();

  const register = async (): Promise<{ data: unknown; error: { message?: string } | null }> => {
    try {
      const { data, error } = await supabase.rpc("register_device_session", buildRegisterDeviceSessionArgs({
        deviceId: credentials.id,
        deviceSecret: credentials.secret,
        label: "Navegador",
        userAgent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null,
      }));
      return { data, error };
    } catch {
      return { data: null, error: { message: "Enrollment service unavailable" } };
    }
  };

  let result = await register();
  if (
    result.error &&
    !isNewDevice &&
    (result.error.message?.includes("Revoked device") ||
      result.error.message?.includes("Device credential is invalid"))
  ) {
    credentials = newDeviceCredentials();
    isNewDevice = true;
    result = await register();
  }

  if (result.error || (result.data !== "approved" && result.data !== "pending")) {
    return NextResponse.json({ error: "DEVICE_ENROLLMENT_UNAVAILABLE" }, { status: 503 });
  }

  const response = NextResponse.json({ status: result.data }, { status: 200 });
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
