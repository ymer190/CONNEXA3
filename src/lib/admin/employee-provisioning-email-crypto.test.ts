import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  decryptProvisioningEmail,
  encryptProvisioningEmail,
} from "./employee-provisioning-email-crypto.ts";

const originalKeys = process.env.EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_KEYS;
const originalCurrentKey = process.env.EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_CURRENT_KEY_ID;

function configureKeyring(keys: Record<string, string>, currentKeyId: string) {
  process.env.EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_KEYS = JSON.stringify(keys);
  process.env.EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_CURRENT_KEY_ID = currentKeyId;
}

test("encrypts and decrypts a normalized email without storing plaintext", () => {
  const key = randomBytes(32).toString("base64");
  configureKeyring({ key_1: key }, "key_1");

  const email = "employee@example.com";
  const encrypted = encryptProvisioningEmail(email);

  assert.notEqual(encrypted, email);
  assert.equal(encrypted.includes(email), false);
  assert.equal(decryptProvisioningEmail(encrypted), email);
});

test("uses the key ID embedded in the ciphertext during key rotation", () => {
  const oldKey = randomBytes(32).toString("base64");
  const newKey = randomBytes(32).toString("base64");

  configureKeyring({ old_key: oldKey }, "old_key");
  const oldCiphertext = encryptProvisioningEmail("employee@example.com");

  configureKeyring({ old_key: oldKey, new_key: newKey }, "new_key");
  assert.equal(decryptProvisioningEmail(oldCiphertext), "employee@example.com");

  const newCiphertext = encryptProvisioningEmail("employee@example.com");
  assert.match(newCiphertext, /^v1\.new_key\./);
  assert.equal(decryptProvisioningEmail(newCiphertext), "employee@example.com");
});

test("fails closed when the keyring is missing", () => {
  delete process.env.EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_KEYS;
  delete process.env.EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_CURRENT_KEY_ID;

  assert.throws(
    () => encryptProvisioningEmail("employee@example.com"),
    /not configured/,
  );
});

test("rejects invalid key material", () => {
  configureKeyring({ key_1: "not-a-valid-key" }, "key_1");
  assert.throws(
    () => encryptProvisioningEmail("employee@example.com"),
    /key is invalid/,
  );
});

test("rejects tampered ciphertext", () => {
  configureKeyring({ key_1: randomBytes(32).toString("base64") }, "key_1");
  const encrypted = encryptProvisioningEmail("employee@example.com");
  const parts = encrypted.split(".");
  parts[4] = `${parts[4].slice(0, -1)}A`;

  assert.throws(
    () => decryptProvisioningEmail(parts.join(".")),
    /ciphertext authentication failed|ciphertext is invalid/,
  );
});

test("rejects non-normalized email input", () => {
  configureKeyring({ key_1: randomBytes(32).toString("base64") }, "key_1");
  assert.throws(
    () => encryptProvisioningEmail("Employee@Example.com"),
    /normalized email/,
  );
});

test.after(() => {
  if (originalKeys === undefined) {
    delete process.env.EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_KEYS;
  } else {
    process.env.EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_KEYS = originalKeys;
  }
  if (originalCurrentKey === undefined) {
    delete process.env.EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_CURRENT_KEY_ID;
  } else {
    process.env.EMPLOYEE_PROVISIONING_EMAIL_ENCRYPTION_CURRENT_KEY_ID = originalCurrentKey;
  }
});
