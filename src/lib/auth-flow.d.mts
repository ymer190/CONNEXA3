export type AuthFailureState = "none" | "missing" | "expired" | "unavailable";

export function getSafeRedirectDestination(next?: string): string;
export function classifyAuthFailure(error: unknown): AuthFailureState;
export function isSameOriginRequest(origin: string | null, requestUrl: string): boolean;
