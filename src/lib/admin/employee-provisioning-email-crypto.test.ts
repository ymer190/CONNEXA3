import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  decryptProvisioningEmailWithKeyring,
  encryptProvisioningEmailWithKeyring,
  validateProvisioningEmailKeyring,
} from "./employee-provisioning-email-crypto-core.ts";

const oldKey = randomBytes(32).toString("base64");
const newKey = randomBytes(32).toString("base64");
const unrelatedKey = randomBytes(32).toString("base64");

test("encrypts and decrypts normalized email without storing plaintext", () => {
  const email = "employee@example.com";
  const encrypted = encryptProvisioningEmailWithKeyring(email, { key_1: oldKey }, "key_1");

  assert.notEqual(encrypted, email);
  assert.equal(encrypted.includes(email), false);
  assert.equal(decryptProvisioningEmailWithKeyring(encrypted, { key_1: oldKey }), email);
});

test("supports key rotation while old ciphertext is being migrated", () => {
  const oldCiphertext = encryptProvisioningEmailWithKeyring(
    "employee@example.com",
    { old_key: oldKey },
    "old_key",
  );
  const keyring = { old_key: oldKey, new_key: newKey };

  assert.equal(decryptProvisioningEmailWithKeyring(oldCiphertext, keyring), "employee@example.com");
  const newCiphertext = encryptProvisioningEmailWithKeyring(
    "employee@example.com",
    keyring,
    "new_key",
  );
  assert.match(newCiphertext, /^v1\\.new_key\\./);
  assert.equal(decryptProvisioningEmailWithKeyring(newCiphertext, keyring), "employee@example.com");
});

test("fails closed when the current key is missing", () => {
  assert.throws(
    () => encryptProvisioningEmailWithKeyring("employee@example.com", { old_key: oldKey }, "missing"),
    /key is unavailable/,
  );
});

test("rejects invalid key material", () => {
  assert.throws(
    () => encryptProvisioningEmailWithKeyring("employee@example.com", { key_1: "invalid" }, "key_1"),
    /key is invalid/,
  );
});

test("rejects a malformed inactive key in the keyring", () => {
  assert.throws(
    () => validateProvisioningEmailKeyring({ active: oldKey, inactive: "invalid" }, "active"),
    /key is invalid/,
  );
});

test("rejects malformed keyring structures and key identifiers", () => {
  assert.throws(() => validateProvisioningEmailKeyring([], "key_1"), /keyring is invalid/);
  assert.throws(
    () => validateProvisioningEmailKeyring({ "invalid.key": oldKey }, "invalid.key"),
    /keyring is invalid/,
  );
});

test("rejects tampered ciphertext", () => {
  const encrypted = encryptProvisioningEmailWithKeyring(
    "employee@example.com",
    { key_1: oldKey },
    "key_1",
  );
  const parts = encrypted.split(".");
  parts[4] = `${parts[4][0] === "A" ? "B" : "A"}${parts[4].slice(1)}`;

  assert.throws(
    () => decryptProvisioningEmailWithKeyring(parts.join("."), { key_1: oldKey }),
    /ciphertext authentication failed|ciphertext is invalid/,
  );
});

test("rejects decryption with a different valid key", () => {
  const encrypted = encryptProvisioningEmailWithKeyring(
    "employee@example.com",
    { key_1: oldKey },
    "key_1",
  );

  assert.throws(
    () => decryptProvisioningEmailWithKeyring(encrypted, { key_1: unrelatedKey }),
    /ciphertext authentication failed/,
  );
});

test("rejects malformed envelope versions and component lengths", () => {
  assert.throws(
    () => decryptProvisioningEmailWithKeyring("v2.key_1.iv.tag.ciphertext", { key_1: oldKey }),
    /ciphertext is invalid/,
  );
  assert.throws(
    () => decryptProvisioningEmailWithKeyring("v1.key_1.aA.aA.aA", { key_1: oldKey }),
    /ciphertext is invalid/,
  );
});

test("authenticates the key id as part of AES-GCM additional data", () => {
  const encrypted = encryptProvisioningEmailWithKeyring(
    "employee@example.com",
    { key_1: oldKey, key_2: oldKey },
    "key_1",
  );
  const parts = encrypted.split(".");
  parts[1] = "key_2";

  assert.throws(
    () => decryptProvisioningEmailWithKeyring(parts.join("."), { key_1: oldKey, key_2: oldKey }),
    /ciphertext authentication failed/,
  );
});

test("rejects non-normalized email input", () => {
  assert.throws(
    () => encryptProvisioningEmailWithKeyring("Employee@Example.com", { key_1: oldKey }, "key_1"),
    /normalized email/,
  );
});
