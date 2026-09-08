import assert from "node:assert/strict";
import test from "node:test";
import { resolvePassword } from "../src/config.js";

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
