import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const AAD_PREFIX = "connexa:employee-provisioning-email:v1:";

type Keyring = Record<string, string>;

function decodeKey(encoded: string): Buffer {
  if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
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

/** Validate every configured key before accepting the keyring. */
export function validateProvisioningEmailKeyring(keys: unknown, currentKeyId: string): asserts keys is Keyring {
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) {
    throw new Error("Employee provisioning email encryption keyring is invalid.");
  }

  const entries = Object.entries(keys as Record<string, unknown>);
  if (entries.length === 0 || !/^[A-Za-z0-9_-]{1,32}$/.test(currentKeyId)) {
    throw new Error("Employee provisioning email encryption keyring is invalid.");
  }

  for (const [keyId, value] of entries) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(keyId) || typeof value !== "string") {
      throw new Error("Employee provisioning email encryption keyring is invalid.");
    }
    decodeKey(value);
  }

  if (!Object.hasOwn(keys, currentKeyId)) {
    throw new Error("Current employee provisioning email encryption key is unavailable.");
  }
}

function aadForKeyId(keyId: string): Buffer {
  return Buffer.from(`${AAD_PREFIX}${keyId}`, "utf8");
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Employee provisioning email ciphertext is invalid.");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error("Employee provisioning email ciphertext is invalid.");
  }
  return decoded;
}

export function encryptProvisioningEmailWithKeyring(
  normalizedEmail: string,
  keys: Keyring,
  currentKeyId: string,
): string {
  if (
    typeof normalizedEmail !== "string" ||
    normalizedEmail.length === 0 ||
    normalizedEmail !== normalizedEmail.trim() ||
    normalizedEmail !== normalizedEmail.toLowerCase()
  ) {
    throw new Error("A normalized email is required for encryption.");
  }

  validateProvisioningEmailKeyring(keys, currentKeyId);
  const key = getKey(keys, currentKeyId);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aadForKeyId(currentKeyId));
  const ciphertext = Buffer.concat([
    cipher.update(normalizedEmail, "utf8"),
    cipher.final(),
  ]);

  return [
    "v1",
    currentKeyId,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptProvisioningEmailWithKeyring(
  envelope: string,
  keys: Keyring,
): string {
  const parts = typeof envelope === "string" ? envelope.split(".") : [];
  if (parts.length !== 5 || parts[0] !== "v1") {
    throw new Error("Employee provisioning email ciphertext is invalid.");
  }

  const [, keyId, encodedIv, encodedTag, encodedCiphertext] = parts;
  const key = getKey(keys, keyId);
  const iv = decodeBase64Url(encodedIv);
  const tag = decodeBase64Url(encodedTag);
  const ciphertext = decodeBase64Url(encodedCiphertext);

  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error("Employee provisioning email ciphertext is invalid.");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(aadForKeyId(keyId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Employee provisioning email ciphertext authentication failed.");
  }
}
