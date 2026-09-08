import { quoteImap, withImap } from "./imap.js";

const decodeWords = (value = "") => value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g, (_, charset, encoding, text) => {
  try {
    const bytes = encoding.toLowerCase() === "b"
      ? Buffer.from(text, "base64")
      : Buffer.from(text.replaceAll("_", " ").replace(/=([0-9a-f]{2})/gi, (m, hex) => String.fromCharCode(Number.parseInt(hex, 16))), "binary");
    return new TextDecoder(charset).decode(bytes);
  } catch { return text; }
});

const unfold = (value) => value.replace(/\r?\n[ \t]+/g, " ");

export function parseMessage(raw) {
  const split = raw.search(/\r?\n\r?\n/);
  const headerText = split < 0 ? raw : raw.slice(0, split);
  const rawBody = split < 0 ? "" : raw.slice(split).replace(/^\r?\n\r?\n/, "");
  const headers = {};
  for (const line of unfold(headerText).split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon > 0) headers[line.slice(0, colon).toLowerCase()] = decodeWords(line.slice(colon + 1).trim());
  }
  const encoding = headers["content-transfer-encoding"]?.toLowerCase();
  let body = rawBody;
  try {
    if (encoding === "base64") body = Buffer.from(rawBody.replace(/\s/g, ""), "base64").toString("utf8");
    if (encoding === "quoted-printable") body = rawBody.replace(/=\r?\n/g, "").replace(/=([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  } catch {}
  return {
    from: headers.from || "",
    to: headers.to || "",
    cc: headers.cc || "",
    subject: headers.subject || "",
    date: headers.date || "",
    messageId: headers["message-id"] || "",
    contentType: headers["content-type"] || "text/plain",
    body,
  };
}

const htmlToText = (html) => {
  let text = "";
  let tag = "";
  let insideTag = false;
  let suppressed = "";
  for (const character of html) {
    if (!insideTag && character === "<") {
      insideTag = true;
      tag = "";
    } else if (insideTag && character === ">") {
      insideTag = false;
      const normalized = tag.trim().toLowerCase();
      const closing = normalized.startsWith("/");
      const name = normalized.replace(/^\/\s*/, "").split(/[\s/]/, 1)[0];
      if (!closing && (name === "script" || name === "style")) suppressed = name;
      else if (closing && name === suppressed) suppressed = "";
      else if (!suppressed && name === "br") text += "\n";
      else if (!suppressed && closing && name === "p") text += "\n\n";
    } else if (insideTag) {
      if (tag.length < 1_024) tag += character;
    } else if (!suppressed) {
      text += character;
    }
  }
  return text;
};

const safeBody = (message, maxChars) => {
  const type = message.contentType.toLowerCase();
  let body = message.body;
  if (type.includes("text/html")) body = htmlToText(body);
  if (type.includes("multipart/")) {
    body = "[Multipart or attachment content omitted by the dependency-free parser]";
  }
  if (!type.includes("text/plain") && !type.includes("text/html") && !type.includes("multipart/")) {
    body = "[Non-text message content omitted]";
  }
  return { body: body.slice(0, maxChars), bodyTruncated: body.length > maxChars };
};

const responseText = (frames) => frames.map((frame) => frame.text);
const literalFrames = (frames) => frames.filter((frame) => frame.literal);

export class MailService {
  #active = 0;
  #recentOperations = [];

  constructor(config, connect = withImap) {
    this.config = config;
    this.connect = connect;
  }

  async run(action) {
    const now = Date.now();
    this.#recentOperations = this.#recentOperations.filter((time) => now - time < 60_000);
    const maximum = this.config.maxOpsPerMinute || 30;
    if (this.#recentOperations.length >= maximum) throw new Error(`Posteo operation limit reached (${maximum}/minute)`);
    if (this.#active >= 2) throw new Error("Posteo concurrency limit reached (2)");
    this.#recentOperations.push(now);
    this.#active += 1;
    try { return await this.connect(this.config, action); }
    finally { this.#active -= 1; }
  }

  async folders() {
    return this.run(async (imap) => responseText(await imap.command("LIST", [quoteImap(""), quoteImap("*")]))
      .filter((line) => line.startsWith("* LIST "))
      .map((line) => {
        const match = line.match(/^\* LIST \(([^)]*)\) (?:"([^"]+)"|NIL) (.+)$/i);
        return { flags: match?.[1]?.split(" ").filter(Boolean) || [], name: match?.[3]?.replace(/^"|"$/g, "") || line };
      }));
  }

  async list(folder = "INBOX", limit = 25, unreadOnly = false) {
    return this.run(async (imap) => {
      await imap.command("SELECT", [quoteImap(folder)]);
      const search = await imap.command("UID SEARCH", [unreadOnly ? "UNSEEN" : "ALL"]);
      const ids = responseText(search).find((line) => line.startsWith("* SEARCH"))?.slice(8).trim().split(/\s+/).filter(Boolean) || [];
      const selected = ids.slice(-limit).reverse();
      if (!selected.length) return [];
      const frames = await imap.command("UID FETCH", [selected.join(","), "(UID FLAGS RFC822.SIZE BODY.PEEK[HEADER.FIELDS (DATE FROM TO SUBJECT MESSAGE-ID)])"]);
      return literalFrames(frames).map((frame) => {
        const uid = frame.text.match(/UID (\d+)/i)?.[1];
        const size = Number(frame.text.match(/RFC822\.SIZE (\d+)/i)?.[1] || 0);
        const parsed = parseMessage(frame.literal.toString("utf8"));
        return { uid: Number(uid), size, flags: [...frame.text.matchAll(/\\[A-Za-z]+/g)].map((m) => m[0]), ...parsed, body: undefined, contentType: undefined };
      });
    });
  }

  async get(folder, uid) {
    return this.run(async (imap) => {
      await imap.command("SELECT", [quoteImap(folder)]);
      const frames = await imap.command("UID FETCH", [String(uid), `(UID RFC822.SIZE BODY.PEEK[]<0.${this.config.maxMessageBytes}>)`]);
      const frame = literalFrames(frames)[0];
      if (!frame) throw new Error(`Message UID ${uid} not found in ${folder}`);
      const parsed = parseMessage(frame.literal.toString("utf8"));
      return {
        uid,
        folder,
        messageTruncated: frame.literal.length >= this.config.maxMessageBytes,
        ...parsed,
        ...safeBody(parsed, this.config.maxBodyChars || 100_000),
      };
    });
  }

  async search(folder, query, limit = 25) {
    return this.run(async (imap) => {
      await imap.command("SELECT", [quoteImap(folder)]);
      const frames = await imap.command("UID SEARCH", ["CHARSET", "UTF-8", "TEXT"], String(query));
      return (responseText(frames).find((line) => line.startsWith("* SEARCH"))?.slice(8).trim().split(/\s+/).filter(Boolean) || []).slice(-limit).reverse().map(Number);
    });
  }

  async setRead(folder, uid, read) {
    return this.run(async (imap) => {
      await imap.command("SELECT", [quoteImap(folder)]);
      await imap.command("UID STORE", [String(uid), read ? "+FLAGS.SILENT" : "-FLAGS.SILENT", "(\\Seen)"]);
      return { uid, folder, read };
    });
  }

  async move(folder, uid, destination) {
    return this.run(async (imap) => {
      await imap.command("SELECT", [quoteImap(folder)]);
      await imap.command("UID MOVE", [String(uid), quoteImap(destination)]);
      return { uid, from: folder, to: destination };
    });
  }

  trash(folder, uid) { return this.move(folder, uid, this.config.trashFolder); }

  async createDraft({ to, cc, subject, body }) {
    const clean = (value) => String(value || "").replace(/[\r\n]+/g, " ").trim();
    const message = [
      `From: ${clean(this.config.username)}`,
      `To: ${clean(to)}`,
      ...(cc ? [`Cc: ${clean(cc)}`] : []),
      `Subject: ${clean(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      String(body || "").replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"),
    ].join("\r\n");
    return this.run(async (imap) => {
      await imap.command("APPEND", [quoteImap(this.config.draftsFolder), "(\\Draft)"], message);
      return { folder: this.config.draftsFolder, to: clean(to), subject: clean(subject) };
    });
  }
}
