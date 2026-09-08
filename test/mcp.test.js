import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createHandler, serve } from "../src/mcp.js";

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

test("tool schemas and execution enforce string bounds and reject extra arguments", async () => {
  const handle = createHandler({ config: { mode: "read-only" }, search: async () => assert.fail("service should not be called") });
  const listed = await handle({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const schema = listed.tools.find((tool) => tool.name === "posteo_search_email").inputSchema;
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.query.maxLength, 2_000);

  const extra = await handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "posteo_search_email", arguments: { query: "hello", surprise: true } } });
  assert.equal(extra.isError, true);
  assert.match(extra.content[0].text, /unexpected argument/);

  const oversized = await handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "posteo_search_email", arguments: { query: "x".repeat(2_001) } } });
  assert.equal(oversized.isError, true);
  assert.match(oversized.content[0].text, /at most 2000 characters/);
});

test("STDIO framing rejects an oversized line and accepts the next request", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const responses = [];
  const finished = new Promise((resolve, reject) => {
    let buffered = "";
    output.on("data", (chunk) => {
      buffered += chunk.toString("utf8");
      const lines = buffered.split("\n");
      buffered = lines.pop();
      try {
        for (const line of lines.filter(Boolean)) responses.push(JSON.parse(line));
        if (responses.length === 2) resolve();
      } catch (error) { reject(error); }
    });
  });
  serve({ config: { mode: "read-only", maxRequestBytes: 96 } }, input, output);
  input.write(`${"x".repeat(97)}\n`);
  input.end(`${JSON.stringify({ jsonrpc: "2.0", id: 7, method: "ping" })}\n`);
  await finished;
  assert.equal(responses[0].error.code, -32600);
  assert.deepEqual(responses[1], { jsonrpc: "2.0", id: 7, result: {} });
});
