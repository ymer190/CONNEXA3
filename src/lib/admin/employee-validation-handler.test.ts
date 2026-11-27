import test from "node:test";
import assert from "node:assert/strict";
import { createEmployeeValidationPostHandler } from "./employee-validation-handler.ts";

const validData = {
  fullName: "Maria da Silva",
  email: "maria@example.com",
  organizationId: "d2719d5e-3c6e-4f80-9c8f-2a2f7b3e9a10",
};

test("returns normalized validation data on success", async () => {
  const handler = createEmployeeValidationPostHandler(async () => ({
    success: true,
    data: validData,
  }));
  const response = await handler(new Request("https://example.test/api/admin/employees/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validData),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: validData });
});

test("returns 409 for duplicate email", async () => {
  const handler = createEmployeeValidationPostHandler(async () => ({
    success: false,
    code: "DUPLICATE_EMAIL",
    message: "Já existe uma conta cadastrada com este e-mail.",
  }));
  const response = await handler(new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify(validData),
  }));
  assert.equal(response.status, 409);
});

test("returns 400 for invalid JSON", async () => {
  const handler = createEmployeeValidationPostHandler(async () => {
    throw new Error("Must not be called");
  });
  const response = await handler(new Request("https://example.test", {
    method: "POST",
    body: "{invalid",
  }));
  assert.equal(response.status, 400);
});

test("maps unauthenticated requests to 401", async () => {
  const handler = createEmployeeValidationPostHandler(async () => ({
    success: false,
    code: "UNAUTHENTICATED",
    message: "É necessário entrar para continuar.",
  }));
  const response = await handler(new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify(validData),
  }));
  assert.equal(response.status, 401);
});

test("fails closed when validation service throws", async () => {
  const handler = createEmployeeValidationPostHandler(async () => {
    throw new Error("internal error");
  });
  const response = await handler(new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify(validData),
  }));
  assert.equal(response.status, 503);
});
