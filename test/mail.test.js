import assert from "node:assert/strict";
import test from "node:test";
import { MailService, parseMessage } from "../src/mail.js";

test("parseMessage decodes common headers and quoted-printable bodies", () => {
  const parsed = parseMessage("From: Ada <ada@example.com>\r\nSubject: =?UTF-8?B?R3LDvMOfZQ==?=\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nHello=20world");
  assert.equal(parsed.subject, "Grüße");
  assert.equal(parsed.body, "Hello world");
});

test("draft creation strips injected header lines and never sends", async () => {
  const calls = [];
  const service = new MailService({ username: "me@posteo.de", draftsFolder: "Drafts" }, async (_config, action) => action({
    command: async (...args) => { calls.push(args); return [{ text: "A0001 OK" }]; },
  }));
  await service.createDraft({ to: "you@example.com\r\nBcc: attacker@example.com", subject: "Hello\nX-Bad: yes", body: "Draft only" });
  assert.equal(calls[0][0], "APPEND");
  assert.match(calls[0][2], /To: you@example\.com Bcc: attacker@example\.com/);
  assert.doesNotMatch(calls[0][2], /\r\nBcc:/);
});

test("fetched HTML bodies are converted to bounded text", async () => {
  const raw = "Content-Type: text/html; charset=utf-8\r\n\r\n<style>bad</style><p>Hello world</p>";
  let calls = 0;
  const service = new MailService({ maxBodyChars: 5, maxMessageBytes: 1_000 }, async (_config, action) => action({
    command: async () => ++calls === 1
      ? [{ text: "A0001 OK" }]
      : [{ text: `* 1 FETCH (UID 7 RFC822.SIZE ${raw.length} {${raw.length}})`, literal: Buffer.from(raw) }, { text: "A0002 OK" }],
  }));
  const message = await service.get("INBOX", 7);
  assert.equal(message.body, "Hello");
  assert.equal(message.bodyTruncated, true);
  assert.doesNotMatch(message.body, /bad|<p>/);
});

test("service rate limit rejects excess operations before connecting", async () => {
  let connections = 0;
  const service = new MailService({ maxOpsPerMinute: 1 }, async (_config, action) => {
    connections += 1;
    return action({ command: async () => [{ text: "A0001 OK" }] });
  });
  await service.folders();
  await assert.rejects(() => service.folders(), /operation limit reached/);
  assert.equal(connections, 1);
});
