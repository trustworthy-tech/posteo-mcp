import assert from "node:assert/strict";
import test from "node:test";
import { quoteImap } from "../src/imap.js";

test("quoteImap escapes quoted values and rejects command injection", () => {
  assert.equal(quoteImap('Archive \\ "2026"'), '"Archive \\\\ \\"2026\\""');
  assert.throws(() => quoteImap("INBOX\r\nA999 LOGOUT"), /control line breaks/);
});
