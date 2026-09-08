const integer = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
};

export function loadConfig() {
  const username = process.env.POSTEO_USERNAME;
  if (!username) throw new Error("POSTEO_USERNAME is required");
  const mode = process.env.POSTEO_MODE || "read-only";
  if (!new Set(["read-only", "drafts", "manage"]).has(mode)) {
    throw new Error("POSTEO_MODE must be read-only, drafts, or manage");
  }
  const keychainService = process.env.POSTEO_KEYCHAIN_SERVICE || "posteo-mcp";
  const password = resolvePassword({ username, keychainService });
  return Object.freeze({
    username,
    password,
    host: "posteo.de",
    port: 993,
    trashFolder: process.env.POSTEO_TRASH_FOLDER || "Trash",
    draftsFolder: process.env.POSTEO_DRAFTS_FOLDER || "Drafts",
    maxMessageBytes: integer("POSTEO_MAX_MESSAGE_BYTES", 1_048_576),
    maxBodyChars: integer("POSTEO_MAX_BODY_CHARS", 100_000),
    networkTimeoutMs: integer("POSTEO_NETWORK_TIMEOUT_MS", 15_000),
    maxOpsPerMinute: integer("POSTEO_MAX_OPS_PER_MINUTE", 30),
    mode,
  });
}

export function resolvePassword({
  username,
  keychainService = "posteo-mcp",
  env = process.env,
  platform = process.platform,
  execute = execFileSync,
}) {
  if (env.POSTEO_PASSWORD) return env.POSTEO_PASSWORD;
  if (platform !== "darwin") throw new Error("POSTEO_PASSWORD is required outside macOS");
  try {
    const password = execute("/usr/bin/security", ["find-generic-password", "-a", username, "-s", keychainService, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!password) throw new Error("empty password");
    return password;
  } catch {
    throw new Error(`No Posteo password found in macOS Keychain service ${keychainService}`);
  }
}
import { execFileSync } from "node:child_process";
