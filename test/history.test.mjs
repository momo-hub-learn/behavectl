import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalStore } from "../src/core/store.mjs";
import {
  buildBehaviorHistory,
  formatBehaviorHistory,
} from "../src/core/history.mjs";

test("Behavior log stays read-only before initialization", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-log-readonly-"));
  const store = new LocalStore(repo);

  const entries = await buildBehaviorHistory(store);

  assert.deepEqual(entries, []);
  await assert.rejects(
    fs.access(path.join(repo, ".behavectl")),
  );

  const output = formatBehaviorHistory(entries);
  assert.match(output, /No Behavior Patches yet/);
});

test("Behavior log summarizes status, verification, and proof integrity", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-log-"));
  const store = new LocalStore(repo);
  await store.init();

  await store.putPatch({
    schema: "behavectl.behavior-patch.v1",
    id: "bp_log",
    version: 1,
    source: {
      kind: "user_correction",
      sourceAgent: "claude-code",
    },
    scope: { kind: "project" },
    behavior: {
      statement: "Always use pnpm.",
    },
    evidence: [],
    risk: "L1",
    targets: ["claude-code", "codex"],
    status: "active",
    createdAt: "2026-09-11T10:00:00.000Z",
    activatedAt: "2026-09-11T11:00:00.000Z",
  });

  await store.putVerification({
    schema: "behavectl.cross-verification.v3",
    id: "verify_log",
    patchId: "bp_log",
    createdAt: "2026-09-11T10:30:00.000Z",
    repeat: 3,
    evaluations: [],
    coverage: {
      passing: ["claude-code", "codex"],
      missingTargets: [],
      passedTrials: 6,
      totalTrials: 6,
    },
    verdict: "promote",
  });

  const entries = await buildBehaviorHistory(store);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, "active");
  assert.equal(entries[0].latestVerification.passedTrials, 6);

  const output = formatBehaviorHistory(entries);
  assert.match(output, /ACTIVE/);
  assert.match(output, /bp_log/);
  assert.match(output, /6\/6/);
  assert.match(output, /Always use pnpm/);
  assert.match(output, /Claude \+ Codex/);
});
