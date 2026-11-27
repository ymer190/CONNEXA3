import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptProvisioningInviteLinkWithKeyring,
  encryptProvisioningInviteLinkWithKeyring,
} from "./employee-provisioning-invite-link-crypto-core.ts";

const keys = { current: Buffer.alloc(32, 7).toString("base64") };
const actionLink = `https://connexa.example.com/confirmar-convite#token_hash=${"a".repeat(64)}&type=invite`;

test("encrypts and decrypts an invite link with authenticated encryption", () => {
  const envelope = encryptProvisioningInviteLinkWithKeyring(actionLink, keys, "current");
  assert.match(envelope, /^v1\.current\./);
  assert.equal(decryptProvisioningInviteLinkWithKeyring(envelope, keys), actionLink);
});

test("rejects tampered invite link ciphertext", () => {
  const envelope = encryptProvisioningInviteLinkWithKeyring(actionLink, keys, "current");
  const tampered = envelope.slice(0, -1) + (envelope.endsWith("A") ? "B" : "A");
  assert.throws(() => decryptProvisioningInviteLinkWithKeyring(tampered, keys));
});

test("rejects non-HTTPS invite links", () => {
  assert.throws(() => encryptProvisioningInviteLinkWithKeyring(
    "http://connexa.example.com/confirmar-convite",
    keys,
    "current",
  ));
});
