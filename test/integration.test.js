import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { MailService } from "../src/mail.js";

test("connects to Posteo and lists folders", { skip: process.env.POSTEO_INTEGRATION !== "1", timeout: 30_000 }, async () => {
  const folders = await new MailService(loadConfig()).folders();
  assert.ok(folders.length > 0);
  assert.ok(folders.some((folder) => folder.name.toUpperCase() === "INBOX"));
});
