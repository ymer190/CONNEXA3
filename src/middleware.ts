import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const isAdminRoute =
    request.nextUrl.pathname === "/admin" ||
    request.nextUrl.pathname.startsWith("/admin/");
  const workspacePaths = ["/", "/conversas", "/grupos", "/colaboradores", "/departamentos", "/arquivos"];
  const isWorkspaceRoute = workspacePaths.some((path) =>
    request.nextUrl.pathname === path ||
    (path !== "/" && request.nextUrl.pathname.startsWith(`${path}/`))
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedRoute && user) {
    const { data: authorizedDevice, error: deviceError } = await supabase.rpc(
      "device_session_is_authorized",
    );
    if (deviceError || authorizedDevice !== true) {
      const pendingUrl = request.nextUrl.clone();
      pendingUrl.pathname = "/dispositivo-pendente";
      pendingUrl.search = "";
      return NextResponse.redirect(pendingUrl);
    }
  }

  if (isWorkspaceRoute && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    const hasAuthCookie = request.cookies.getAll().some((cookie) =>
      cookie.name.startsWith("sb-") && cookie.name.includes("auth-token")
    );
    loginUrl.searchParams.set("reason", hasAuthCookie ? "session-expired" : "auth-required");
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }

    const { data: platformUser, error } = await supabase
      .from("platform_users")
      .select("user_id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || platformUser?.role !== "platform_admin") {
      const forbiddenUrl = request.nextUrl.clone();
      forbiddenUrl.pathname = "/acesso-negado";
      forbiddenUrl.search = "";
      return NextResponse.redirect(forbiddenUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
