import test from "node:test";
import assert from "node:assert/strict";
import { validateEmployeeRegistration } from "./employee-registration-validation-core.ts";

const validPayload = {
  fullName: "Maria da Silva",
  email: "MARIA@EXAMPLE.COM",
  organizationId: "d2719d5e-3c6e-4f80-9c8f-2a2f7b3e9a10",
};

test("accepts valid data when email and organization are available", async () => {
  const result = await validateEmployeeRegistration(validPayload, {
    emailExists: async () => ({ success: true, exists: false }),
    organizationExists: async () => ({ success: true, exists: true }),
  });
  assert.deepEqual(result, {
    success: true,
    data: {
      fullName: "Maria da Silva",
      email: "maria@example.com",
      organizationId: validPayload.organizationId,
    },
  });
});

test("maps invalid input errors into the stable validation contract", async () => {
  const result = await validateEmployeeRegistration({ email: "bad" }, {
    emailExists: async () => ({ success: true, exists: false }),
    organizationExists: async () => ({ success: true, exists: true }),
  });
  assert.deepEqual(result, {
    success: false,
    code: "INVALID_NAME",
    message: "Informe um nome válido.",
  });
});

test("rejects duplicate email before checking organization", async () => {
  let organizationChecked = false;
  const result = await validateEmployeeRegistration(validPayload, {
    emailExists: async () => ({ success: true, exists: true }),
    organizationExists: async () => {
      organizationChecked = true;
      return { success: true, exists: true };
    },
  });
  assert.equal(organizationChecked, false);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, "DUPLICATE_EMAIL");
});

test("rejects an unknown organization", async () => {
  const result = await validateEmployeeRegistration(validPayload, {
    emailExists: async () => ({ success: true, exists: false }),
    organizationExists: async () => ({ success: true, exists: false }),
  });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, "ORGANIZATION_NOT_FOUND");
});

test("fails closed when duplicate lookup fails", async () => {
  const result = await validateEmployeeRegistration(validPayload, {
    emailExists: async () => ({ success: false }),
    organizationExists: async () => ({ success: true, exists: true }),
  });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, "VALIDATION_CHECK_FAILED");
});

test("fails closed when organization lookup fails", async () => {
  const result = await validateEmployeeRegistration(validPayload, {
    emailExists: async () => ({ success: true, exists: false }),
    organizationExists: async () => ({ success: false }),
  });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, "VALIDATION_CHECK_FAILED");
});

test("rejects malformed input without querying dependencies", async () => {
  let queried = false;
  const result = await validateEmployeeRegistration({ email: "bad" }, {
    emailExists: async () => {
      queried = true;
      return { success: true, exists: false };
    },
    organizationExists: async () => ({ success: true, exists: true }),
  });
  assert.equal(queried, false);
  assert.equal(result.success, false);
});
