import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, resolvePassword } from "../src/config.js";

test("environment password remains an explicit cross-platform fallback", () => {
  assert.equal(resolvePassword({ username: "me@posteo.de", env: { POSTEO_PASSWORD: "secret" }, platform: "linux" }), "secret");
});

test("macOS password lookup uses fixed executable and argument boundaries", () => {
  let invocation;
  const password = resolvePassword({
    username: "me@posteo.de",
    keychainService: "posteo-mcp",
    env: {},
    platform: "darwin",
    execute: (...args) => { invocation = args; return "app-password\n"; },
  });
  assert.equal(password, "app-password");
  assert.deepEqual(invocation[0], "/usr/bin/security");
  assert.deepEqual(invocation[1], ["find-generic-password", "-a", "me@posteo.de", "-s", "posteo-mcp", "-w"]);
});

test("numeric configuration rejects partially parsed values", () => {
  const before = { ...process.env };
  try {
    process.env.POSTEO_USERNAME = "me@posteo.de";
    process.env.POSTEO_PASSWORD = "test-only";
    process.env.POSTEO_MAX_REQUEST_BYTES = "64junk";
    assert.throws(() => loadConfig(), /positive integer/);
  } finally {
    process.env = before;
  }
});
