import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalStore } from "../src/core/store.mjs";
import { createBehaviorProof } from "../src/core/proof.mjs";
import { behaviorPatchDigest } from "../src/core/fingerprint.mjs";

function patch() {
  return {
    schema: "behavectl.behavior-patch.v1",
    id: "bp_proof",
    version: 1,
    source: {
      kind: "user_correction",
      eventId: "evt_1",
      sourceAgent: "claude-code",
    },
    scope: { kind: "project" },
    behavior: { statement: "Always use pnpm." },
    evidence: [
      {
        kind: "user_correction",
        eventId: "evt_1",
        confidence: 0.95,
      },
    ],
    risk: "L1",
    targets: ["claude-code", "codex"],
    status: "tested",
    createdAt: new Date().toISOString(),
  };
}

function evaluation(runner, id = `eval_${runner}`) {
  return {
    schema: "behavectl.evaluation.v1",
    id,
    patchId: "bp_proof",
    patchDigest: behaviorPatchDigest(patch()),
    runner,
    specId: "spec_1",
    createdAt: new Date().toISOString(),
    baseline: {
      passed: false,
      checks: [
        {
          id: "uses-pnpm",
          label: "Uses pnpm",
          kind: "command_matches",
          target: "pnpm",
          passed: false,
        },
      ],
      observation: {
        commands: ["npm install"],
        metadata: { tokenCount: 12000, durationMs: 5000 },
      },
    },
    candidate: {
      passed: true,
      checks: [
        {
          id: "uses-pnpm",
          label: "Uses pnpm",
          kind: "command_matches",
          target: "pnpm",
          passed: true,
        },
      ],
      observation: {
        commands: ["pnpm add zod"],
        metadata: { tokenCount: 9000, durationMs: 4000 },
      },
    },
    verdict: "promote",
  };
}

test("Behavior Proof exports a portable single-agent real-eval bundle", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-proof-"));
  const store = new LocalStore(repo);
  await store.init();
  await store.putPatch(patch());
  await store.putEvaluation(evaluation("claude-code"));

  const proof = await createBehaviorProof(store, "bp_proof");

  const names = (await fs.readdir(proof.dir)).sort();
  assert.deepEqual(names, [
    "PROOF.md",
    "checksums.json",
    "diffs",
    "evaluations",
    "manifest.json",
    "patch.json",
    "verification.json",
  ]);

  const markdown = await fs.readFile(
    path.join(proof.dir, "PROOF.md"),
    "utf8",
  );

  assert.match(markdown, /Behavectl Behavior Proof/);
  assert.match(markdown, /Claude Code/);
  assert.match(markdown, /Uses pnpm/);
  assert.match(markdown, /PROMOTE/);
  assert.match(markdown, /behavectl proof verify/);
  assert.match(markdown, /behavectl rollback bp_proof/);
  assert.equal(proof.manifest.integrity.algorithm, "sha256");
  assert.equal(proof.manifest.coverage.passed, 1);
  assert.equal(proof.manifest.coverage.total, 1);
});

test("multi-agent proof contains Cross-Agent Behavior Matrix", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-proof-cross-"));
  const store = new LocalStore(repo);
  await store.init();
  await store.putPatch(patch());
  await store.putEvaluation(evaluation("claude-code", "eval_claude"));
  await new Promise((resolve) => setTimeout(resolve, 2));
  await store.putEvaluation(evaluation("codex", "eval_codex"));

  const proof = await createBehaviorProof(store, "bp_proof");

  await fs.access(path.join(proof.dir, "behavior-matrix.txt"));

  const markdown = await fs.readFile(
    path.join(proof.dir, "PROOF.md"),
    "utf8",
  );

  assert.match(markdown, /Cross-Agent Behavior Matrix/);
  assert.match(markdown, /Claude Code/);
  assert.match(markdown, /Codex/);
  assert.match(markdown, /2\/2 agents stable/);
  assert.equal(proof.manifest.coverage.passed, 2);
  assert.equal(proof.manifest.coverage.total, 2);
});

test("fixture evaluation cannot create a Behavior Proof", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-proof-fixture-"));
  const store = new LocalStore(repo);
  await store.init();
  await store.putPatch(patch());
  await store.putEvaluation(evaluation("fixture", "eval_fixture"));

  await assert.rejects(
    createBehaviorProof(store, "bp_proof"),
    /no real Behavior Diff/i,
  );
});


test("proof preserves all trials from the latest persisted stability verification", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-proof-stable-"));
  const store = new LocalStore(repo);
  await store.init();
  await store.putPatch(patch());

  const evaluations = [];
  for (const runner of ["claude-code", "codex"]) {
    for (let trial = 1; trial <= 3; trial++) {
      const value = evaluation(
        runner,
        `eval_${runner}_${trial}`,
      );
      value.trial = trial;
      value.repeat = 3;
      evaluations.push(value);
      await store.putEvaluation(value);
    }
  }

  const verification = {
    schema: "behavectl.cross-verification.v2",
    id: "verify_stable",
    patchId: "bp_proof",
    patchDigest: behaviorPatchDigest(patch()),
    specId: "spec_1",
    createdAt: new Date().toISOString(),
    repeat: 3,
    evaluations,
    agents: [
      {
        runner: "claude-code",
        totalTrials: 3,
        passedTrials: 3,
        passRate: 1,
      },
      {
        runner: "codex",
        totalTrials: 3,
        passedTrials: 3,
        passRate: 1,
      },
    ],
    coverage: {
      agents: ["claude-code", "codex"],
      passing: ["claude-code", "codex"],
      total: 2,
      passed: 2,
      totalTrials: 6,
      passedTrials: 6,
    },
    verdict: "promote",
  };

  await store.putVerification(verification);

  const proof = await createBehaviorProof(store, "bp_proof");

  assert.equal(proof.manifest.repeat, 3);
  assert.equal(proof.manifest.verificationId, "verify_stable");

  const evalFiles = await fs.readdir(
    path.join(proof.dir, "evaluations"),
  );
  assert.equal(evalFiles.length, 6);

  const markdown = await fs.readFile(
    path.join(proof.dir, "PROOF.md"),
    "utf8",
  );

  assert.match(markdown, /Trials:\*\* \*\*6\/6 passed/);
  assert.match(markdown, /Trial 3\/3/);
  assert.match(markdown, /single successful run/i);
});


test("Behavior Proof refuses a patch changed after verification", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-proof-stale-"));
  const store = new LocalStore(repo);
  await store.init();

  const original = patch();
  await store.putPatch(original);

  const verified = evaluation("claude-code", "eval_stale");
  await store.putEvaluation(verified);

  await store.putVerification({
    schema: "behavectl.cross-verification.v3",
    id: "verify_stale",
    patchId: original.id,
    patchVersion: original.version,
    patchDigest: behaviorPatchDigest(original),
    specId: "spec_1",
    specDigest: "spec-digest",
    createdAt: new Date().toISOString(),
    repeat: 1,
    evaluations: [verified],
    agents: [
      {
        runner: "claude-code",
        totalTrials: 1,
        passedTrials: 1,
        passRate: 1,
      },
    ],
    coverage: {
      agents: ["claude-code"],
      passing: ["claude-code"],
      requiredTargets: ["claude-code", "codex"],
      missingTargets: ["codex"],
      total: 1,
      passed: 1,
      totalTrials: 1,
      passedTrials: 1,
    },
    verdict: "mixed",
  });

  await store.updatePatch(original.id, (current) => ({
    ...current,
    behavior: {
      statement: "Always use npm.",
    },
  }));

  await assert.rejects(
    createBehaviorProof(store, original.id),
    (error) =>
      error?.code === "BCTL_PROOF_STALE_VERIFICATION" &&
      /changed after verification/i.test(error.message),
  );
});

test("Behavior Proof manifest records the exact patch digest", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-proof-digest-"));
  const store = new LocalStore(repo);
  await store.init();

  const value = patch();
  value.targets = ["claude-code"];
  await store.putPatch(value);

  const evalValue = evaluation("claude-code", "eval_digest");
  evalValue.patchDigest = behaviorPatchDigest(value);
  await store.putEvaluation(evalValue);

  await store.putVerification({
    schema: "behavectl.cross-verification.v3",
    id: "verify_digest",
    patchId: value.id,
    patchVersion: value.version,
    patchDigest: behaviorPatchDigest(value),
    specId: "spec_1",
    specDigest: "spec-digest",
    createdAt: new Date().toISOString(),
    repeat: 1,
    evaluations: [evalValue],
    agents: [
      {
        runner: "claude-code",
        totalTrials: 1,
        passedTrials: 1,
        passRate: 1,
      },
    ],
    coverage: {
      agents: ["claude-code"],
      passing: ["claude-code"],
      requiredTargets: ["claude-code"],
      missingTargets: [],
      total: 1,
      passed: 1,
      totalTrials: 1,
      passedTrials: 1,
    },
    verdict: "promote",
  });

  const proof = await createBehaviorProof(store, value.id);

  assert.equal(proof.manifest.schema, "behavectl.behavior-proof.v4");
  assert.equal(
    proof.manifest.patchDigest,
    behaviorPatchDigest(value),
  );
});
