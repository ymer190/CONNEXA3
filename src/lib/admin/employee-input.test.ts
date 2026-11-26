import assert from "node:assert/strict";
import test from "node:test";

import { validateCreateEmployeeInput } from "./employee-input";

const validInput = {
  fullName: "Maria da Silva",
  email: "maria@example.com",
  organizationId: "550e8400-e29b-41d4-a716-446655440000",
};

test("accepts valid employee data and normalizes name, email and organization UUID", () => {
  const result = validateCreateEmployeeInput({
    fullName: "  Maria   da Silva  ",
    email: "  MARIA@EXAMPLE.COM ",
    organizationId: "550E8400-E29B-41D4-A716-446655440000",
  });

  assert.deepEqual(result, {
    success: true,
    data: {
      fullName: "Maria da Silva",
      email: "maria@example.com",
      organizationId: "550e8400-e29b-41d4-a716-446655440000",
    },
  });
});

test("rejects null, arrays and primitive payloads", () => {
  for (const value of [null, [], "employee", 42, true]) {
    const result = validateCreateEmployeeInput(value);
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.error.code, "INVALID_PAYLOAD");
  }
});

test("rejects names shorter than 2 or longer than 120 characters", () => {
  for (const fullName of [" ", "A", "A".repeat(121)]) {
    const result = validateCreateEmployeeInput({ ...validInput, fullName });
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.error.code, "INVALID_NAME");
  }
});

test("rejects malformed or oversized email addresses", () => {
  for (const email of ["not-an-email", "missing-domain@", "a".repeat(243) + "@example.com"]) {
    const result = validateCreateEmployeeInput({ ...validInput, email });
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.error.code, "INVALID_EMAIL");
  }
});

test("rejects malformed organization identifiers", () => {
  for (const organizationId of ["", "organization-1", "550e8400-e29b-41d4-a716-44665544000Z"]) {
    const result = validateCreateEmployeeInput({ ...validInput, organizationId });
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.error.code, "INVALID_ORGANIZATION_ID");
  }
});
