import { createHash } from "node:crypto";

export const PROVISIONING_STATUSES = [
  "pending",
  "completed",
  "compensation_pending",
  "compensated",
  "manual_reconciliation_required",
] as const;

export type ProvisioningStatus = (typeof PROVISIONING_STATUSES)[number];

export type NormalizedProvisioningPayload = {
  fullName: string;
  email: string;
  organizationId: string;
};

export function createProvisioningPayloadHash(
  payload: NormalizedProvisioningPayload,
): string {
  const { fullName, email, organizationId } = payload;
  if (
    !fullName ||
    fullName !== fullName.trim().replace(/\s+/g, " ") ||
    !email ||
    email !== email.trim().toLowerCase() ||
    !organizationId ||
    organizationId !== organizationId.toLowerCase()
  ) {
    throw new Error("A normalized provisioning payload is required.");
  }

  // Fixed-position tuple makes serialization deterministic and avoids trusting
  // a client-provided hash or object property ordering.
  const canonicalPayload = JSON.stringify([fullName, email, organizationId]);
  return `sha256:${createHash("sha256").update(canonicalPayload, "utf8").digest("hex")}`;
}

export type ProvisioningOperation = {
  idempotencyKey: string;
  payloadHash: string;
  status: ProvisioningStatus;
  authUserId: string | null;
  attempts: number;
};

export type IdempotencyDecision =
  | { kind: "create" }
  | { kind: "reuse"; operation: ProvisioningOperation }
  | { kind: "conflict" };

export function decideIdempotency(
  existing: ProvisioningOperation | null,
  idempotencyKey: string,
  payloadHash: string,
): IdempotencyDecision {
  if (!existing) return { kind: "create" };
  if (existing.idempotencyKey !== idempotencyKey) return { kind: "create" };
  if (existing.payloadHash !== payloadHash) return { kind: "conflict" };
  return { kind: "reuse", operation: existing };
}

const ALLOWED_TRANSITIONS: Record<ProvisioningStatus, readonly ProvisioningStatus[]> = {
  pending: ["completed", "compensation_pending", "compensated", "manual_reconciliation_required"],
  completed: [],
  compensation_pending: ["compensated", "manual_reconciliation_required"],
  compensated: [],
  manual_reconciliation_required: ["compensation_pending", "compensated"],
};

export function transitionProvisioningOperation(
  current: ProvisioningStatus,
  next: ProvisioningStatus,
): { success: true; status: ProvisioningStatus } | { success: false; code: "INVALID_TRANSITION" } {
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    return { success: false, code: "INVALID_TRANSITION" };
  }
  return { success: true, status: next };
}

/**
 * Compensation is permitted only when the caller can prove that the Auth
 * identity was created by this exact operation. Email equality is insufficient.
 */
export function mayCompensateAuthUser(input: {
  authUserId: string | null;
  identityProvenForOperation: boolean;
  preexistingIdentity: boolean;
}): boolean {
  return Boolean(
    input.authUserId &&
    input.identityProvenForOperation &&
    !input.preexistingIdentity,
  );
}

/** Redacts common credentials and personal identifiers before persistence. */
export function sanitizeProvisioningError(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? "Unknown error");
  return raw
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/(password|token|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 240);
}
