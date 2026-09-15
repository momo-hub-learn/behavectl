import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalStore } from "../src/core/store.mjs";
import { promotePatch, rollbackPatch } from "../src/core/lifecycle.mjs";

function patch(id) {
  return {
    schema: "behavectl.behavior-patch.v1",
    id,
    version: 1,
    source: { kind: "user_correction", eventId: "evt_test" },
    scope: { kind: "project" },
    behavior: { statement: "Always use pnpm for dependency operations." },
    evidence: [],
    risk: "L1",
    targets: ["claude-code", "codex"],
    status: "candidate",
    createdAt: new Date().toISOString(),
  };
}

test("promotion compiles managed Claude rule and preserves human AGENTS content", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-life-"));
  const store = new LocalStore(repo);
  await store.init();

  await fs.writeFile(
    path.join(repo, "AGENTS.md"),
    "# Human instructions\n\nKeep this text.\n",
  );

  await store.putPatch(patch("bp_demo"));
  await promotePatch(store, "bp_demo", { force: true });

  const claudeRule = await fs.readFile(
    path.join(repo, ".claude/rules/behavectl/bp_demo.md"),
    "utf8",
  );
  assert.match(claudeRule, /Always use pnpm/);

  const agents = await fs.readFile(path.join(repo, "AGENTS.md"), "utf8");
  assert.match(agents, /# Human instructions/);
  assert.match(agents, /behavectl:start/);
  assert.match(agents, /bp_demo/);

  await rollbackPatch(store, "bp_demo");

  const after = await fs.readFile(path.join(repo, "AGENTS.md"), "utf8");
  assert.match(after, /# Human instructions/);
  assert.doesNotMatch(after, /behavectl:start/);
  assert.doesNotMatch(after, /bp_demo/);

  await assert.rejects(
    fs.access(path.join(repo, ".claude/rules/behavectl")),
  );
});


test("rollback removes AGENTS.md if it contained only Behavectl behavior", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-clean-"));
  const store = new LocalStore(repo);
  await store.init();

  await store.putPatch(patch("bp_only"));
  await promotePatch(store, "bp_only", { force: true });
  await fs.access(path.join(repo, "AGENTS.md"));

  await rollbackPatch(store, "bp_only");
  await assert.rejects(fs.access(path.join(repo, "AGENTS.md")));
});
