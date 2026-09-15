import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalStore } from "../src/core/store.mjs";
import { renderInbox, renderProgress, renderPromotionSuccess, renderReview, buildReviewModel } from "../src/ui/review.mjs";

function candidate(id = "bp_review") {
  return {
    schema: "behavectl.behavior-patch.v1",
    id,
    version: 1,
    source: { kind: "user_correction", eventId: "evt_1", sourceAgent: "claude-code" },
    scope: { kind: "project" },
    behavior: { statement: "Don't use npm in this repo. We always use pnpm." },
    evidence: [
      { kind: "user_correction", eventId: "evt_1", text: "Don't use npm", confidence: 0.92 },
      { kind: "repo_file", path: "pnpm-lock.yaml", fact: "pnpm-lock.yaml exists in the project root." },
    ],
    risk: "L1",
    targets: ["claude-code", "codex"],
    status: "candidate",
    createdAt: new Date().toISOString(),
  };
}

test("plain review is screenshot-quality and semantic", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-review-"));
  const store = new LocalStore(repo);
  await store.init();
  await store.putPatch(candidate());

  const model = await buildReviewModel(store, candidate());
  const text = renderReview(model, { plain: true });

  assert.match(text, /BEHAVECTL/);
  assert.match(text, /Behavior change review/);
  assert.match(text, /What changed/);
  assert.match(text, /Explicit user correction/);
  assert.match(text, /Scope & targets/);
  assert.match(text, /No Behavior Spec yet/);
  assert.doesNotMatch(text, /\\x1b/);
});

test("inbox orders pending patches and gives review command", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-inbox-"));
  const store = new LocalStore(repo);
  await store.init();
  await store.putPatch(candidate("bp_one"));
  const text = await renderInbox(store);
  assert.match(text, /Behavior inbox/);
  assert.match(text, /1 behavior change waiting for review/);
  assert.match(text, /bp_one/);
  assert.match(text, /behavectl review <id>/);
});


test("progress surface is concise and explicit about isolation", () => {
  const output = renderProgress({
    patchId: "bp_test",
    agent: "claude",
    baseline: "done",
    candidate: "running",
    plain: true,
  });

  assert.match(output, /Real Behavior Diff/);
  assert.match(output, /baseline\s+done/);
  assert.match(output, /candidate\s+running/);
  assert.match(output, /working tree is not used/);
});

test("promotion success makes rollback obvious", () => {
  const output = renderPromotionSuccess({
    patch: { id: "bp_test" },
    artifacts: [
      { adapter: "claude-code", path: ".claude/rules/behavectl/bp_test.md" },
      { adapter: "codex", path: "AGENTS.md" },
    ],
    plain: true,
  });

  assert.match(output, /Behavior promoted/);
  assert.match(output, /Claude|claude-code/);
  assert.match(output, /Codex|codex/);
  assert.match(output, /behavectl rollback bp_test/);
});


test("plain review renders cross-agent verification matrix", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-review-cross-"));
  const store = new LocalStore(repo);
  await store.init();
  const patch = candidate("bp_cross_review");
  patch.status = "tested";
  await store.putPatch(patch);

  const makeEval = (runner) => ({
    schema: "behavectl.evaluation.v1",
    id: `eval_${runner}`,
    patchId: patch.id,
    runner,
    specId: "spec",
    createdAt: new Date().toISOString(),
    baseline: {
      passed: false,
      checks: [{ id: "uses-pnpm", label: "Uses pnpm", passed: false }],
      observation: { commands: ["npm install"], metadata: {} },
    },
    candidate: {
      passed: true,
      checks: [{ id: "uses-pnpm", label: "Uses pnpm", passed: true }],
      observation: { commands: ["pnpm add"], metadata: {} },
    },
    verdict: "promote",
  });

  const claude = makeEval("claude-code");
  const codex = makeEval("codex");
  await store.putEvaluation(claude);
  await store.putEvaluation(codex);

  await store.putVerification({
    schema: "behavectl.cross-verification.v3",
    id: "verify_review_cross",
    patchId: patch.id,
    patchVersion: patch.version,
    patchDigest: "test-digest",
    specId: "spec",
    specDigest: "test-spec-digest",
    createdAt: new Date().toISOString(),
    repeat: 1,
    evaluations: [claude, codex],
    agents: [
      {
        runner: "claude-code",
        totalTrials: 1,
        passedTrials: 1,
        passRate: 1,
      },
      {
        runner: "codex",
        totalTrials: 1,
        passedTrials: 1,
        passRate: 1,
      },
    ],
    coverage: {
      agents: ["claude-code", "codex"],
      passing: ["claude-code", "codex"],
      requiredTargets: ["claude-code", "codex"],
      missingTargets: [],
      total: 2,
      passed: 2,
      totalTrials: 2,
      passedTrials: 2,
    },
    verdict: "promote",
  });

  const model = await buildReviewModel(store, patch);
  const output = renderReview(model, { plain: true });

  assert.match(output, /Cross-Agent Verification/);
  assert.match(output, /Claude Code/);
  assert.match(output, /Codex/);
  assert.match(output, /READY TO PROMOTE/);
});
