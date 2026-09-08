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
  const raw = "Content-Type: text/html; charset=utf-8\r\n\r\n<style>bad</style><script>also bad</script><p>Hello world</p>";
  let calls = 0;
  const service = new MailService({ maxBodyChars: 5, maxMessageBytes: 1_000 }, async (_config, action) => action({
    command: async () => ++calls === 1
      ? [{ text: "A0001 OK" }]
      : [{ text: `* 1 FETCH (UID 7 RFC822.SIZE ${raw.length} {${raw.length}})`, literal: Buffer.from(raw) }, { text: "A0002 OK" }],
  }));
  const message = await service.get("INBOX", 7);
  assert.equal(message.body, "Hello");
  assert.equal(message.bodyTruncated, true);
  assert.doesNotMatch(message.body, /bad|<p>|script|style/);
});

test("multipart bodies are omitted instead of exposing raw attachments", async () => {
  const raw = "Content-Type: multipart/mixed; boundary=example\r\n\r\n--example\r\nContent-Type: application/octet-stream\r\n\r\nSECRET_ATTACHMENT_DATA";
  let calls = 0;
  const service = new MailService({ maxBodyChars: 1_000, maxMessageBytes: 10_000 }, async (_config, action) => action({
    command: async () => ++calls === 1
      ? [{ text: "A0001 OK" }]
      : [{ text: `* 1 FETCH (UID 8 RFC822.SIZE ${raw.length} {${raw.length}})`, literal: Buffer.from(raw) }, { text: "A0002 OK" }],
  }));
  const message = await service.get("INBOX", 8);
  assert.match(message.body, /omitted/);
  assert.doesNotMatch(message.body, /SECRET_ATTACHMENT_DATA/);
});

test("header-only listing uses BODY.PEEK so reading metadata does not mark mail seen", async () => {
  const commands = [];
  const service = new MailService({}, async (_config, action) => action({
    command: async (command, args) => {
      commands.push([command, args]);
      if (command === "UID SEARCH") return [{ text: "* SEARCH 42" }, { text: "A0002 OK" }];
      if (command === "UID FETCH") return [{ text: "* 1 FETCH (UID 42 FLAGS () RFC822.SIZE 12 {12})", literal: Buffer.from("Subject: Hi\r\n") }, { text: "A0003 OK" }];
      return [{ text: "A0001 OK" }];
    },
  }));
  await service.list("INBOX", 1, false);
  const fetch = commands.find(([command]) => command === "UID FETCH");
  assert.match(fetch[1][1], /BODY\.PEEK/);
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
