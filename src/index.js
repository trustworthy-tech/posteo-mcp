#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { MailService } from "./mail.js";
import { serve } from "./mcp.js";

try {
  serve(new MailService(loadConfig()));
} catch (error) {
  process.stderr.write(`posteo-mcp: ${error.message}\n`);
  process.exitCode = 1;
}
