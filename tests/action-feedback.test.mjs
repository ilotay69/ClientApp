import test from "node:test";
import assert from "node:assert/strict";
import { confirmedAction, ACTION_ERROR } from "../src/lib/action-feedback.ts";

test("only an explicit confirmation is successful", async () => {
  assert.deepEqual(await confirmedAction(async () => ({ ok: true })), {
    ok: true,
  });
  for (const result of [
    undefined,
    null,
    {},
    true,
    { ok: "true" },
    { data: {} },
    { ok: false },
  ]) {
    assert.deepEqual(await confirmedAction(async () => result), {
      ok: false,
      error: ACTION_ERROR,
    });
  }
});
test("resolved server failures never show success", async () => {
  for (const result of [
    { ok: false, error: "Permission denied" },
    { error: "Permission denied" },
    { ok: true, error: "Permission denied" },
  ]) {
    assert.deepEqual(await confirmedAction(async () => result), {
      ok: false,
      error: "Permission denied",
    });
  }
});
test("transport errors are safe and retryable", async () => {
  assert.deepEqual(
    await confirmedAction(async () => {
      throw new Error("private internals");
    }),
    { ok: false, error: ACTION_ERROR },
  );
  assert.deepEqual(await confirmedAction(async () => ({ ok: true })), {
    ok: true,
  });
});
test("confirmation waits for the operation rather than a timer", async () => {
  let finish;
  let settled = false;
  const request = confirmedAction(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  ).then((result) => {
    settled = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  finish({ ok: true });
  assert.deepEqual(await request, { ok: true });
});
