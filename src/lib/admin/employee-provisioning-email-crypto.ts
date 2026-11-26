import "server-only";

import {
  decryptProvisioningEmailWithKeyring,
  encryptProvisioningEmailWithKeyring,
  validateProvisioningEmailKeyring,
} from "./employee-provisioning-email-crypto-core.ts";

const KEYRING_ENV = "EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_KEYS";
const CURRENT_KEY_ENV = "EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_CURRENT_KEY_ID";

function loadKeyring(): { keys: Record<string, string>; currentKeyId: string } {
  const rawKeyring = process.env[KEYRING_ENV];
  const currentKeyId = process.env[CURRENT_KEY_ENV];

  if (!rawKeyring || !currentKeyId) {
    throw new Error("Employee provisioning email encryption is not configured.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawKeyring);
  } catch {
    throw new Error("Employee provisioning email encryption configuration is invalid.");
  }

  try {
    validateProvisioningEmailKeyring(parsed, currentKeyId);
  } catch {
    throw new Error("Employee provisioning email encryption configuration is invalid.");
  }

  return { keys: parsed, currentKeyId };
}

export function encryptProvisioningEmail(normalizedEmail: string): string {
  const { keys, currentKeyId } = loadKeyring();
  return encryptProvisioningEmailWithKeyring(normalizedEmail, keys, currentKeyId);
}

export function decryptProvisioningEmail(envelope: string): string {
  const { keys } = loadKeyring();
  return decryptProvisioningEmailWithKeyring(envelope, keys);
}
