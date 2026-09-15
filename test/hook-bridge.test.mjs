import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { installHookBridge } from "../src/core/hook-bridge.mjs";
import { LocalStore } from "../src/core/store.mjs";

test("project-local hook bridge survives without package imports", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-bridge-"));
  const store = new LocalStore(repo);
  await store.init();

  const bridge = await installHookBridge(repo);

  const payload = {
    hook_event_name: "UserPromptSubmit",
    cwd: repo,
    session_id: "session-1",
    prompt: "Never use npm in this project. Use pnpm.",
  };

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bridge, "claude"], {
      cwd: repo,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `bridge exited ${code}`));
    });

    child.stdin.end(JSON.stringify(payload));
  });

  const events = await store.events();
  assert.equal(events.length, 1);
  assert.equal(events[0].source, "claude-code");
  assert.equal(events[0].kind, "UserPromptSubmit");
  assert.equal(events[0].data.prompt, payload.prompt);

  const bridgeSource = await fs.readFile(bridge, "utf8");
  assert.doesNotMatch(bridgeSource, /@behavectl|from "\.\.\/|from '\.\.\//);
});
