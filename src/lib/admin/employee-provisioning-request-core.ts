import { validateCreateEmployeeInput } from "./employee-input.ts";
import { createProvisioningPayloadHash } from "./employee-provisioning-core.ts";
import type { EmployeeProvisioningPayload } from "./employee-provisioning-orchestrator-core.ts";

export type EmployeeProvisioningRequestResult =
  | { success: true; data: EmployeeProvisioningPayload }
  | {
      success: false;
      code: "INVALID_PAYLOAD" | "INVALID_IDEMPOTENCY_KEY" | "INVALID_ACTOR";
      message: string;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7E]{1,128}$/;

/**
 * Builds the trusted orchestration input from request data.
 * The payload hash and actor ID are always derived server-side; any similarly
 * named fields supplied by the browser are intentionally ignored.
 */
export function prepareEmployeeProvisioningRequest(
  body: unknown,
  idempotencyKey: unknown,
  authenticatedActorUserId: unknown,
): EmployeeProvisioningRequestResult {
  const parsed = validateCreateEmployeeInput(body);
  if (!parsed.success) {
    return {
      success: false,
      code: "INVALID_PAYLOAD",
      message: parsed.error.message,
    };
  }

  if (
    typeof idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)
  ) {
    return {
      success: false,
      code: "INVALID_IDEMPOTENCY_KEY",
      message: "Informe uma chave de idempotência válida.",
    };
  }

  if (
    typeof authenticatedActorUserId !== "string" ||
    !UUID_PATTERN.test(authenticatedActorUserId)
  ) {
    return {
      success: false,
      code: "INVALID_ACTOR",
      message: "Não foi possível identificar o administrador autenticado.",
    };
  }

  const normalized = parsed.data;
  return {
    success: true,
    data: {
      ...normalized,
      payloadHash: createProvisioningPayloadHash(normalized),
      idempotencyKey,
      actorUserId: authenticatedActorUserId,
    },
  };
}
