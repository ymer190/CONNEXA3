const applicationOrigin = "https://connexa.invalid";

export function getSafeRedirectDestination(next) {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(next)) {
    return "/";
  }

  try {
    const destination = new URL(next, applicationOrigin);
    if (destination.origin !== applicationOrigin) return "/";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}

export function classifyAuthFailure(error) {
  if (!error) return "none";
  if (typeof error === "object" && error !== null && "name" in error && error.name === "AuthSessionMissingError") {
    return "missing";
  }

  const status = typeof error === "object" && error !== null && "status" in error
    ? Number(error.status)
    : NaN;
  if (status === 401 || status === 403) return "expired";
  return "unavailable";
}

export function isSameOriginRequest(origin, requestUrl) {
  if (typeof origin !== "string" || !origin || origin === "null") return false;
  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.origin === origin && parsedOrigin.origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}
