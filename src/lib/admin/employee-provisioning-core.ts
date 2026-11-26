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
  if (
    typeof idempotencyKey !== "string" ||
    !/^[\x21-\x7E]{1,128}$/.test(idempotencyKey) ||
    typeof payloadHash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(payloadHash)
  ) {
    throw new Error("A valid idempotency key and payload hash are required.");
  }

  if (!existing) return { kind: "create" };

  // An existing row returned for this key must never be silently treated as a
  // new operation if its stored key differs: that indicates a lookup/integrity
  // error and must fail closed.
  if (existing.idempotencyKey !== idempotencyKey) return { kind: "conflict" };
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

export function sanitizeProvisioningError(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? "Unknown error");
  return raw
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/(password|token|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 240);
}
