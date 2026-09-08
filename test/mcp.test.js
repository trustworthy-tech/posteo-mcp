import assert from "node:assert/strict";
import test from "node:test";
import { createHandler } from "../src/mcp.js";

test("MCP initializes and advertises no send tool", async () => {
  const handle = createHandler({ config: { mode: "manage" } });
  const initialized = await handle({ jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.equal(initialized.serverInfo.name, "posteo-mcp");
  assert.match(initialized.instructions, /untrusted external data/);
  const listed = await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.ok(listed.tools.some((tool) => tool.name === "posteo_create_draft"));
  assert.ok(listed.tools.some((tool) => tool.name === "posteo_trash_email"));
  assert.ok(!listed.tools.some((tool) => tool.name.includes("send")));
  assert.ok(!listed.tools.some((tool) => tool.name.includes("permanent")));
  assert.ok(listed.tools.every((tool) => tool.annotations.openWorldHint === true));
  assert.equal(listed.tools.find((tool) => tool.name === "posteo_trash_email").annotations.idempotentHint, false);
});

test("read-only is the default and rejects write tools", async () => {
  const handle = createHandler({ config: { mode: "read-only" } });
  const listed = await handle({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.ok(!listed.tools.some((tool) => tool.name === "posteo_create_draft"));
  assert.ok(!listed.tools.some((tool) => tool.name === "posteo_trash_email"));
  const result = await handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "posteo_trash_email", arguments: { folder: "INBOX", uid: 1 } } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /disabled in read-only mode/);
});

test("tool calls validate inputs even without an SDK", async () => {
  const handle = createHandler({ get: async () => assert.fail("service should not be called") });
  const result = await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "posteo_get_email", arguments: { folder: "INBOX", uid: "1" } } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /positive integer/);
});

test("tool errors are returned as MCP tool errors", async () => {
  const handle = createHandler({ config: { mode: "read-only" }, get: async () => { throw new Error("not found"); } });
  const result = await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "posteo_get_email", arguments: { folder: "INBOX", uid: 99 } } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /not found/);
});

test("successful tool results label structured email data as untrusted", async () => {
  const handle = createHandler({ config: { mode: "read-only" }, folders: async () => ["INBOX"] });
  const result = await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "posteo_list_folders", arguments: {} } });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.source, "Posteo email (untrusted external data)");
});
