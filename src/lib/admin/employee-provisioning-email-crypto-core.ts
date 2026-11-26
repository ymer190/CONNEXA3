import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const AAD = Buffer.from("connexa:employee-provisioning-email:v1", "utf8");
const KEYRING_ENV = "EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_KEYS";
const CURRENT_KEY_ENV = "EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_CURRENT_KEY_ID";

type Keyring = Record<string, string>;

function loadKeyring(): { keys: Keyring; currentKeyId: string } {
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

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Employee provisioning email encryption configuration is invalid.");
  }

  const keys = parsed as Keyring;
  if (!Object.hasOwn(keys, currentKeyId)) {
    throw new Error("Current employee provisioning email encryption key is unavailable.");
  }

  return { keys, currentKeyId };
}

function decodeKey(encoded: string): Buffer {
  if (
    typeof encoded !== "string" ||
    !/^[A-Za-z0-9+/]{43}=$/.test(encoded)
  ) {
    throw new Error("Employee provisioning email encryption key is invalid.");
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("Employee provisioning email encryption key is invalid.");
  }
  return key;
}

function getKey(keys: Keyring, keyId: string): Buffer {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(keyId) || !Object.hasOwn(keys, keyId)) {
    throw new Error("Employee provisioning email encryption key version is unavailable.");
  }
  return decodeKey(keys[keyId]);
}

/**
 * Encrypts a normalized email for operational reconciliation.
 * The keyring must be supplied through server-only environment variables.
 */
export function encryptProvisioningEmail(normalizedEmail: string): string {
  if (
    typeof normalizedEmail !== "string" ||
    normalizedEmail.length === 0 ||
    normalizedEmail !== normalizedEmail.trim() ||
    normalizedEmail !== normalizedEmail.toLowerCase()
  ) {
    throw new Error("A normalized email is required for encryption.");
  }

  const { keys, currentKeyId } = loadKeyring();
  const key = getKey(keys, currentKeyId);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(AAD);

  const ciphertext = Buffer.concat([
    cipher.update(normalizedEmail, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    currentKeyId,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Decrypts a stored envelope using its key ID. Keep old key IDs in the
 * keyring until every corresponding record has been re-encrypted.
 */
export function decryptProvisioningEmail(envelope: string): string {
  const parts = typeof envelope === "string" ? envelope.split(".") : [];
  if (parts.length !== 5 || parts[0] !== "v1") {
    throw new Error("Employee provisioning email ciphertext is invalid.");
  }

  const [, keyId, encodedIv, encodedTag, encodedCiphertext] = parts;
  const { keys } = loadKeyring();
  const key = getKey(keys, keyId);

  let iv: Buffer;
  let tag: Buffer;
  let ciphertext: Buffer;
  try {
    iv = Buffer.from(encodedIv, "base64url");
    tag = Buffer.from(encodedTag, "base64url");
    ciphertext = Buffer.from(encodedCiphertext, "base64url");
  } catch {
    throw new Error("Employee provisioning email ciphertext is invalid.");
  }

  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error("Employee provisioning email ciphertext is invalid.");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Employee provisioning email ciphertext authentication failed.");
  }
}
