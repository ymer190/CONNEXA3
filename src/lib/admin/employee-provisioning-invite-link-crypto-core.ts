import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  validateProvisioningEmailKeyring,
} from "./employee-provisioning-email-crypto-core.ts";

type Keyring = Record<string, string>;
const AAD_PREFIX = "connexa:employee-provisioning-invite-link:v1:";

function decodeKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("Employee provisioning encryption key is invalid.");
  }
  return key;
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Employee provisioning invite link ciphertext is invalid.");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error("Employee provisioning invite link ciphertext is invalid.");
  }
  return decoded;
}

function getKey(keys: Keyring, keyId: string): Buffer {
  if (!Object.hasOwn(keys, keyId)) {
    throw new Error("Employee provisioning encryption key version is unavailable.");
  }
  return decodeKey(keys[keyId]);
}

function aadForKeyId(keyId: string): Buffer {
  return Buffer.from(`${AAD_PREFIX}${keyId}`, "utf8");
}

export function encryptProvisioningInviteLinkWithKeyring(
  actionLink: string,
  keys: Keyring,
  currentKeyId: string,
): string {
  let url: URL;
  try {
    url = new URL(actionLink);
  } catch {
    throw new Error("A valid HTTPS invite link is required.");
  }
  if (url.protocol !== "https:") {
    throw new Error("A valid HTTPS invite link is required.");
  }

  validateProvisioningEmailKeyring(keys, currentKeyId);
  const key = getKey(keys, currentKeyId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aadForKeyId(currentKeyId));
  const ciphertext = Buffer.concat([
    cipher.update(actionLink, "utf8"),
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

export function decryptProvisioningInviteLinkWithKeyring(
  envelope: string,
  keys: Keyring,
): string {
  const parts = typeof envelope === "string" ? envelope.split(".") : [];
  if (parts.length !== 5 || parts[0] !== "v1") {
    throw new Error("Employee provisioning invite link ciphertext is invalid.");
  }

  const [, keyId, encodedIv, encodedTag, encodedCiphertext] = parts;
  const key = getKey(keys, keyId);
  const iv = decodeBase64Url(encodedIv);
  const tag = decodeBase64Url(encodedTag);
  const ciphertext = decodeBase64Url(encodedCiphertext);
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error("Employee provisioning invite link ciphertext is invalid.");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aadForKeyId(keyId));
    decipher.setAuthTag(tag);
    const actionLink = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const url = new URL(actionLink);
    if (url.protocol !== "https:") {
      throw new Error("Employee provisioning invite link is invalid.");
    }
    return actionLink;
  } catch {
    throw new Error("Employee provisioning invite link authentication failed.");
  }
}
