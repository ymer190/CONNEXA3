import test from "node:test";
import assert from "node:assert/strict";
import { findAuthUserByEmail } from "./email-duplicate-core.ts";

test("finds an existing email case-insensitively", async () => {
  const result = await findAuthUserByEmail(" PERSON@EXAMPLE.COM ", {
    listUsers: async () => ({
      success: true,
      users: [{ email: "person@example.com" }],
    }),
  });
  assert.deepEqual(result, { success: true, exists: true });
});

test("checks the next page when the first page is full", async () => {
  const pages: number[] = [];
  const result = await findAuthUserByEmail("person@example.com", {
    listUsers: async (page, perPage) => {
      pages.push(page);
      assert.equal(perPage, 1000);
      return {
        success: true,
        users: page === 1
          ? Array.from({ length: 1000 }, (_, index) => ({ email: `user${index}@example.com` }))
          : [{ email: "person@example.com" }],
      };
    },
  });
  assert.deepEqual(pages, [1, 2]);
  assert.deepEqual(result, { success: true, exists: true });
});

test("returns no duplicate when the result set is exhausted", async () => {
  const result = await findAuthUserByEmail("missing@example.com", {
    listUsers: async () => ({ success: true, users: [{ email: "other@example.com" }] }),
  });
  assert.deepEqual(result, { success: true, exists: false });
});

test("fails closed when Auth lookup fails", async () => {
  const result = await findAuthUserByEmail("person@example.com", {
    listUsers: async () => ({ success: false }),
  });
  assert.deepEqual(result, { success: false, code: "USER_LOOKUP_FAILED" });
});

test("fails closed when Auth lookup throws", async () => {
  const result = await findAuthUserByEmail("person@example.com", {
    listUsers: async () => { throw new Error("internal error"); },
  });
  assert.deepEqual(result, { success: false, code: "USER_LOOKUP_FAILED" });
});
