import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  installClaudeHooks,
  uninstallClaudeHooks,
} from "../src/adapters/claude/hooks.mjs";
import {
  installCodexHooks,
  uninstallCodexHooks,
} from "../src/adapters/codex/hooks.mjs";

test("uninstall removes only Behavectl hooks", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-uninstall-"));
  const bridge = path.join(repo, ".behavectl/hooks/capture.mjs");

  await installClaudeHooks(repo, bridge);
  await installCodexHooks(repo, bridge);

  const claudeFile = path.join(repo, ".claude/settings.local.json");
  const claude = JSON.parse(await fs.readFile(claudeFile, "utf8"));
  claude.hooks.Stop.push({
    hooks: [{ type: "command", command: "echo keep-me" }],
  });
  await fs.writeFile(claudeFile, JSON.stringify(claude));

  const codexFile = path.join(repo, ".codex/hooks.json");
  const codex = JSON.parse(await fs.readFile(codexFile, "utf8"));
  codex.hooks.Stop.push({
    hooks: [{ type: "command", command: "echo keep-me" }],
  });
  await fs.writeFile(codexFile, JSON.stringify(codex));

  await uninstallClaudeHooks(repo);
  await uninstallCodexHooks(repo);

  const c1 = JSON.parse(await fs.readFile(claudeFile, "utf8"));
  const c2 = JSON.parse(await fs.readFile(codexFile, "utf8"));

  assert.equal(c1.hooks.Stop.length, 1);
  assert.equal(c1.hooks.Stop[0].hooks[0].command, "echo keep-me");
  assert.equal(c2.hooks.Stop.length, 1);
  assert.equal(c2.hooks.Stop[0].hooks[0].command, "echo keep-me");
});
