import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { MailService } from "../src/mail.js";
import { createHandler } from "../src/mcp.js";

test("completes a read-only MCP-to-Keychain-to-Posteo folder call", { skip: process.env.POSTEO_INTEGRATION !== "1", timeout: 30_000 }, async () => {
  const service = new MailService({ ...loadConfig(), mode: "read-only" });
  const handle = createHandler(service);
  const initialized = await handle({ jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.equal(initialized.serverInfo.name, "posteo-mcp");
  const listed = await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(listed.tools.map((tool) => tool.name), [
    "posteo_list_folders",
    "posteo_list_email",
    "posteo_get_email",
    "posteo_search_email",
  ]);
  const response = await handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "posteo_list_folders", arguments: {} } });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.source, "Posteo email (untrusted external data)");
  const folders = response.structuredContent.result;
  assert.ok(folders.length > 0);
  assert.ok(folders.some((folder) => folder.name.toUpperCase() === "INBOX"));
});
