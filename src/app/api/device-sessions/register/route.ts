import { randomBytes, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function newDeviceCredentials() {
  return { id: randomUUID(), secret: randomBytes(32).toString("base64url") };
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const secure = process.env.NODE_ENV === "production";
  let credentials = {
    id: cookieStore.get("connexa-device-id")?.value ?? "",
    secret: cookieStore.get("connexa-device-secret")?.value ?? "",
  };

  if (!credentials.id || !credentials.secret) {
    credentials = newDeviceCredentials();
  }

  const { data, error } = await supabase.rpc("register_device_session", {
    p_device_id: credentials.id,
    p_device_secret: credentials.secret,
    p_label: "Navegador",
    p_user_agent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null,
  });

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
