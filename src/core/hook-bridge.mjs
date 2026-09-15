import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "./fs.mjs";

export function renderHookBridge() {
  // Intentionally dependency-free. This file is copied into the user's repo
  // so hooks keep working even when Behavectl was invoked through `npx`.
  return `#!/usr/bin/env node
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";

const sourceArg = process.argv[2];
const source = sourceArg === "claude" ? "claude-code" : sourceArg === "codex" ? "codex" : null;
if (!source) process.exit(0);

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
if (!input.trim()) process.exit(0);

let raw;
try { raw = JSON.parse(input); } catch { process.exit(0); }

const repoRoot = findRoot(typeof raw.cwd === "string" ? raw.cwd : process.cwd());
const event = normalize(raw, source, repoRoot);

const dir = path.join(repoRoot, ".behavectl", "events");
await fs.mkdir(dir, { recursive: true });
await fs.appendFile(
  path.join(dir, "events.jsonl"),
  JSON.stringify(event) + "\\n",
  "utf8",
);

function normalize(raw, source, repoRoot) {
  const kind = String(raw.hook_event_name ?? "Unknown");
  const data = {};

  if (kind === "UserPromptSubmit" && typeof raw.prompt === "string") {
    data.prompt = raw.prompt;
  }

  if (["PreToolUse", "PostToolUse", "PostToolUseFailure"].includes(kind)) {
    if (typeof raw.tool_name === "string") data.toolName = raw.tool_name;
    if (raw.tool_input && typeof raw.tool_input === "object") data.toolInput = raw.tool_input;
    if (typeof raw.tool_use_id === "string") data.toolUseId = raw.tool_use_id;
  }

  if (kind === "Stop" && typeof raw.last_assistant_message === "string") {
    data.lastAssistantMessage = raw.last_assistant_message;
  }

  if (kind === "SessionEnd" && typeof raw.reason === "string") {
    data.reason = raw.reason;
  }

  return {
    schema: "behavectl.event.v1",
    id: "evt_" + Date.now().toString(36) + crypto.randomBytes(5).toString("hex"),
    source,
    kind,
    observedAt: new Date().toISOString(),
    repoRoot,
    cwd: path.resolve(typeof raw.cwd === "string" ? raw.cwd : repoRoot),
    sessionId: typeof raw.session_id === "string" ? raw.session_id : undefined,
    turnId: typeof raw.turn_id === "string" ? raw.turn_id : undefined,
    data,
    rawMeta: {
      bridgeVersion: 1,
    },
  };
}

function findRoot(start) {
  let cur = path.resolve(start);
  while (true) {
    if (existsSync(path.join(cur, ".behavectl"))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return path.resolve(start);
    cur = parent;
  }
}
`;
}

export async function installHookBridge(repoRoot) {
  const dir = path.join(repoRoot, ".behavectl", "hooks");
  await ensureDir(dir);
  const file = path.join(dir, "capture.mjs");
  await fs.writeFile(file, renderHookBridge(), "utf8");
  await fs.chmod(file, 0o755).catch(() => {});
  return file;
}
