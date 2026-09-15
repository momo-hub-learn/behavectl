import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { installClaudeHooks } from "../src/adapters/claude/hooks.mjs";

test("Claude hook install is idempotent and preserves existing settings", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-"));
  const claude = path.join(repo, ".claude");
  await fs.mkdir(claude, { recursive: true });

  const settings = path.join(claude, "settings.local.json");
  await fs.writeFile(
    settings,
    JSON.stringify({
      permissions: { allow: ["Bash(git status)"] },
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [{ type: "command", command: "echo existing" }],
          },
        ],
      },
    }),
  );

  const first = await installClaudeHooks(repo, "/tmp/project/.behavectl/hooks/capture.mjs");
  const second = await installClaudeHooks(repo, "/tmp/project/.behavectl/hooks/capture.mjs");

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);

  const saved = JSON.parse(await fs.readFile(settings, "utf8"));
  assert.deepEqual(saved.permissions, { allow: ["Bash(git status)"] });

  const ours = saved.hooks.UserPromptSubmit.filter((group) =>
    group.hooks?.some((h) => h.command?.includes("capture.mjs") && h.command?.endsWith(" claude")),
  );
  assert.equal(ours.length, 1);

  for (const name of [
    "UserPromptSubmit",
    "PostToolUse",
    "PostToolUseFailure",
    "Stop",
    "SessionEnd",
  ]) {
    assert.ok(Array.isArray(saved.hooks[name]));
  }
});
