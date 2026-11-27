import "server-only";

import {
  decryptProvisioningInviteLinkWithKeyring,
  encryptProvisioningInviteLinkWithKeyring,
} from "./employee-provisioning-invite-link-crypto-core.ts";
import { validateProvisioningEmailKeyring } from "./employee-provisioning-email-crypto-core.ts";

const KEYRING_ENV = "EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_KEYS";
const CURRENT_KEY_ENV = "EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_CURRENT_KEY_ID";

function loadKeyring(): { keys: Record<string, string>; currentKeyId: string } {
  const rawKeyring = process.env[KEYRING_ENV];
  const currentKeyId = process.env[CURRENT_KEY_ENV];
  if (!rawKeyring || !currentKeyId) {
    throw new Error("Employee provisioning encryption is not configured.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawKeyring);
    validateProvisioningEmailKeyring(parsed, currentKeyId);
  } catch {
    throw new Error("Employee provisioning encryption configuration is invalid.");
  }

  return { keys: parsed, currentKeyId };
}

export function encryptProvisioningInviteLink(actionLink: string): string {
  const { keys, currentKeyId } = loadKeyring();
  return encryptProvisioningInviteLinkWithKeyring(actionLink, keys, currentKeyId);
}

export function decryptProvisioningInviteLink(envelope: string): string {
  const { keys } = loadKeyring();
  return decryptProvisioningInviteLinkWithKeyring(envelope, keys);
}
