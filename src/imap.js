import tls from "node:tls";

export const quoteImap = (value) => {
  const text = String(value);
  if (/[\r\n\0]/.test(text)) throw new Error("IMAP values cannot contain control line breaks");
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
};

export class ImapError extends Error {
  constructor(message, response = []) {
    super(message);
    this.name = "ImapError";
    this.response = response;
  }
}

export class ImapClient {
  #config;
  #socket;
  #buffer = Buffer.alloc(0);
  #waiters = [];
  #tag = 0;
  #greeting;

  constructor(config) {
    this.#config = config;
  }

  async connect() {
    if (this.#socket) return;
    this.#socket = tls.connect({
      host: this.#config.host,
      port: this.#config.port,
      servername: this.#config.host,
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    });
    this.#socket.setTimeout(this.#config.networkTimeoutMs || 15_000, () => {
      this.#socket?.destroy(new Error("IMAP network timeout"));
    });
    this.#socket.on("data", (chunk) => this.#onData(chunk));
    this.#socket.on("error", (error) => this.#failWaiters(error));
    this.#socket.on("close", () => this.#failWaiters(new Error("IMAP connection closed")));
    await new Promise((resolve, reject) => {
      this.#socket.once("secureConnect", resolve);
      this.#socket.once("error", reject);
    });
    this.#greeting = await this.#nextFrame();
    if (!this.#greeting.text.startsWith("* OK")) throw new ImapError("IMAP server rejected connection");
    await this.command("LOGIN", [quoteImap(this.#config.username), quoteImap(this.#config.password)]);
  }

  async close() {
    if (!this.#socket) return;
    try { await this.command("LOGOUT"); } catch {}
    this.#socket.end();
    this.#socket = undefined;
  }

  async command(command, args = [], literal) {
    if (!this.#socket) throw new Error("IMAP client is not connected");
    const tag = `A${String(++this.#tag).padStart(4, "0")}`;
    const suffix = args.length ? ` ${args.join(" ")}` : "";
    if (literal !== undefined) {
      const bytes = Buffer.isBuffer(literal) ? literal : Buffer.from(literal);
      this.#socket.write(`${tag} ${command}${suffix} {${bytes.length}}\r\n`);
      const continuation = await this.#nextFrame();
      if (!continuation.text.startsWith("+")) throw new ImapError("IMAP server refused literal", [continuation]);
      this.#socket.write(bytes);
      this.#socket.write("\r\n");
    } else {
      this.#socket.write(`${tag} ${command}${suffix}\r\n`);
    }

    const response = [];
    while (true) {
      const frame = await this.#nextFrame();
      response.push(frame);
      if (!frame.text.startsWith(`${tag} `)) continue;
      if (!frame.text.startsWith(`${tag} OK`)) throw new ImapError(frame.text, response);
      return response;
    }
  }

  #onData(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    this.#drain();
  }

  #drain() {
    while (this.#waiters.length) {
      const lineEnd = this.#buffer.indexOf("\r\n");
      if (lineEnd < 0) return;
      const line = this.#buffer.subarray(0, lineEnd).toString("utf8");
      const literalMatch = line.match(/\{(\d+)\}$/);
      const literalLength = literalMatch ? Number(literalMatch[1]) : 0;
      const total = lineEnd + 2 + literalLength;
      if (this.#buffer.length < total) return;
      const literal = literalMatch ? this.#buffer.subarray(lineEnd + 2, total) : undefined;
      this.#buffer = this.#buffer.subarray(total);
      if (literal && this.#buffer.subarray(0, 2).equals(Buffer.from("\r\n"))) {
        this.#buffer = this.#buffer.subarray(2);
      }
      this.#waiters.shift().resolve({ text: line, literal });
    }
  }

  #nextFrame() {
    return new Promise((resolve, reject) => {
      this.#waiters.push({ resolve, reject });
      this.#drain();
    });
  }

  #failWaiters(error) {
    for (const waiter of this.#waiters.splice(0)) waiter.reject(error);
  }
}

export async function withImap(config, action) {
  const client = new ImapClient(config);
  await client.connect();
  try { return await action(client); } finally { await client.close(); }
}
