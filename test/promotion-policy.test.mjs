import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalStore } from "../src/core/store.mjs";
import { promotePatch } from "../src/core/lifecycle.mjs";
import { verifyAcrossAgents } from "../src/core/verify.mjs";

function patch() {
  return {
    schema: "behavectl.behavior-patch.v1",
    id: "bp_policy",
    version: 1,
    source: {
      kind: "user_correction",
      eventId: "evt_policy",
      sourceAgent: "claude-code",
    },
    scope: { kind: "project" },
    behavior: {
      statement: "Always use pnpm.",
    },
    evidence: [],
    risk: "L1",
    targets: ["claude-code", "codex"],
    status: "candidate",
    createdAt: new Date().toISOString(),
  };
}

const spec = {
  schema: "behavectl.behavior-spec.v1",
  id: "spec_policy",
  task: "Add zod.",
  checks: [
    {
      id: "uses-pnpm",
      label: "Uses pnpm",
      kind: "command_matches",
      value: "pnpm",
    },
  ],
};

function passingRunner(id) {
  return {
    id,
    async run({ patch: candidate }) {
      return {
        commands: candidate
          ? ["pnpm add zod"]
          : ["npm install zod"],
        output: "",
        exitCode: 0,
        metadata: {},
      };
    },
  };
}

test("promotion blocks partial target coverage", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-policy-partial-"));
  await fs.writeFile(path.join(repo, "package.json"), "{}");

  const store = new LocalStore(repo);
  await store.init();
  const value = patch();
  await store.putPatch(value);

  const verification = await verifyAcrossAgents({
    repoRoot: repo,
    patch: value,
    spec,
    runners: [passingRunner("claude-code")],
  });

  assert.equal(verification.verdict, "mixed");
  assert.deepEqual(
    verification.coverage.missingTargets,
    ["codex"],
  );

  for (const evaluation of verification.evaluations) {
    await store.putEvaluation(evaluation);
  }
  await store.putVerification(verification);

  await assert.rejects(
    promotePatch(store, value.id),
    /missing targets: codex/i,
  );
});

test("promotion blocks a patch changed after verification", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-policy-stale-"));
  await fs.writeFile(path.join(repo, "package.json"), "{}");

  const store = new LocalStore(repo);
  await store.init();
  const value = patch();
  await store.putPatch(value);

  const verification = await verifyAcrossAgents({
    repoRoot: repo,
    patch: value,
    spec,
    runners: [
      passingRunner("claude-code"),
      passingRunner("codex"),
    ],
  });

  for (const evaluation of verification.evaluations) {
    await store.putEvaluation(evaluation);
  }
  await store.putVerification(verification);

  await store.updatePatch(value.id, (current) => ({
    ...current,
    behavior: {
      statement: "Always use npm.",
    },
  }));

  await assert.rejects(
    promotePatch(store, value.id),
    /changed after its latest verification/i,
  );
});

test("promotion succeeds only for current fully-covered verification", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-policy-pass-"));
  await fs.writeFile(path.join(repo, "package.json"), "{}");

  const store = new LocalStore(repo);
  await store.init();
  const value = patch();
  await store.putPatch(value);

  const verification = await verifyAcrossAgents({
    repoRoot: repo,
    patch: value,
    spec,
    repeat: 2,
    runners: [
      passingRunner("claude-code"),
      passingRunner("codex"),
    ],
  });

  assert.equal(verification.verdict, "promote");
  assert.equal(verification.coverage.missingTargets.length, 0);

  for (const evaluation of verification.evaluations) {
    await store.putEvaluation(evaluation);
  }
  await store.putVerification(verification);

  const result = await promotePatch(store, value.id);
  assert.equal(result.changed, true);
  assert.equal(result.patch.status, "active");

  await fs.access(
    path.join(
      repo,
      ".claude",
      "rules",
      "behavectl",
      `${value.id}.md`,
    ),
  );
  await fs.access(path.join(repo, "AGENTS.md"));
});
