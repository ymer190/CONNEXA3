import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { classifyAuthFailure } from "@/lib/auth-flow.mjs";

const workspacePaths = ["/", "/conversas", "/grupos", "/colaboradores", "/departamentos", "/arquivos"];

function hasAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) =>
    cookie.name.startsWith("sb-") && cookie.name.includes("auth-token")
  );
}

function copySessionResponse(source: NextResponse, destination: NextResponse) {
  for (const cookie of source.cookies.getAll()) destination.cookies.set(cookie);
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = source.headers.get(header);
    if (value) destination.headers.set(header, value);
  }
  destination.headers.set("Cache-Control", "private, no-store");
  return destination;
}

function redirectWithSession(request: NextRequest, response: NextResponse, pathname: string, query?: Record<string, string>) {
  const destination = request.nextUrl.clone();
  destination.pathname = pathname;
  destination.search = "";
  for (const [key, value] of Object.entries(query ?? {})) destination.searchParams.set(key, value);
  return copySessionResponse(response, NextResponse.redirect(destination));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const isAdminRoute =
    pathname === "/admin" || pathname.startsWith("/admin/");
  const isWorkspaceRoute = workspacePaths.some((path) =>
    pathname === path ||
    (path !== "/" && pathname.startsWith(`${path}/`))
  );
  const isProtectedRoute = isAdminRoute || isWorkspaceRoute;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    if (isProtectedRoute) {
      const forbiddenUrl = request.nextUrl.clone();
      forbiddenUrl.pathname = "/acesso-negado";
      forbiddenUrl.search = "";
      return NextResponse.redirect(forbiddenUrl);
    }

    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers ?? {}).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
        },
      },
    },
  );

  let user: User | null = null;
  let authError: unknown = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    authError = result.error;
  } catch (error) {
    authError = error;
  }
  const authFailure = classifyAuthFailure(authError);
  if (isProtectedRoute && authFailure === "unavailable") {
    return redirectWithSession(request, response, "/servico-indisponivel", {
      next: `${pathname}${request.nextUrl.search}`,
    });
  }

  const isFirstAccessPending =
    user?.app_metadata?.first_access_pending === true;
  const isFirstAccessAllowedPath = [
    "/primeiro-acesso",
    "/confirmar-convite",
    "/api/auth/first-access/password",
    "/api/auth/accept-invite",
    "/auth/logout",
  ].some((path) =>
    request.nextUrl.pathname === path ||
    request.nextUrl.pathname.startsWith(`${path}/`)
  );

  if (isFirstAccessPending && !isFirstAccessAllowedPath) {
    const firstAccessUrl = request.nextUrl.clone();
    firstAccessUrl.pathname = "/primeiro-acesso";
    firstAccessUrl.search = "";
    return copySessionResponse(response, NextResponse.redirect(firstAccessUrl));
  }

  if (request.nextUrl.pathname === "/primeiro-acesso" && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("reason", "auth-required");
    return copySessionResponse(response, NextResponse.redirect(loginUrl));
  }

  // Issue #97: every authenticated protected route requires an approved device.
  if (isProtectedRoute && user) {
    try {
      const { data: authorizedDevice, error: deviceError } = await supabase.rpc(
        "device_session_is_authorized",
      );
      if (deviceError) {
        return redirectWithSession(request, response, "/servico-indisponivel", {
          next: `${pathname}${request.nextUrl.search}`,
        });
      }
      if (authorizedDevice !== true) {
        return redirectWithSession(request, response, "/dispositivo-pendente", {
          next: `${pathname}${request.nextUrl.search}`,
        });
      }
    } catch {
      return redirectWithSession(request, response, "/servico-indisponivel", {
        next: `${pathname}${request.nextUrl.search}`,
      });
    }
  }

  if (isWorkspaceRoute && !user) {
    const reason = authFailure === "expired" || hasAuthCookie(request)
      ? "session-expired"
      : "auth-required";
    return redirectWithSession(request, response, "/login", {
      next: `${pathname}${request.nextUrl.search}`,
      reason,
    });
  }

  if (isAdminRoute) {
    if (!user) {
      return redirectWithSession(request, response, "/login", {
        next: `${pathname}${request.nextUrl.search}`,
        reason: authFailure === "expired" || hasAuthCookie(request) ? "session-expired" : "auth-required",
      });
    }

    try {
      const { data: platformUser, error } = await supabase
        .from("platform_users")
        .select("user_id, role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        return redirectWithSession(request, response, "/servico-indisponivel", {
          next: `${pathname}${request.nextUrl.search}`,
        });
      }
      if (platformUser?.role !== "platform_admin") {
        return redirectWithSession(request, response, "/acesso-negado");
      }
    } catch {
      return redirectWithSession(request, response, "/servico-indisponivel", {
        next: `${pathname}${request.nextUrl.search}`,
      });
    }
  }

  if (isProtectedRoute) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
