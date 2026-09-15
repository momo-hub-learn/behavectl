import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalStore } from "../src/core/store.mjs";
import { promotePatch } from "../src/core/lifecycle.mjs";
import { createBehaviorProof } from "../src/core/proof.mjs";
import {
  evaluateBehaviorCI,
  installBehaviorCI,
  renderBehaviorCIMarkdown,
} from "../src/core/ci.mjs";
import { runProcess } from "../src/core/eval/process.mjs";
import { behaviorPatchDigest } from "../src/core/fingerprint.mjs";
import { writeProofIntegrity } from "../src/core/proof-integrity.mjs";

async function initRepo(prefix = "behavectl-ci-") {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), prefix));

  await runProcess("git", ["init"], {
    cwd: repo,
    allowFailure: false,
  });
  await runProcess(
    "git",
    ["config", "user.name", "Behavectl Test"],
    { cwd: repo, allowFailure: false },
  );
  await runProcess(
    "git",
    ["config", "user.email", "test@behavectl.local"],
    { cwd: repo, allowFailure: false },
  );

  await fs.writeFile(
    path.join(repo, "README.md"),
    "# fixture\n",
  );
  await commit(repo, "base");

  const base = (
    await runProcess("git", ["rev-parse", "HEAD"], {
      cwd: repo,
      allowFailure: false,
    })
  ).stdout.trim();

  return { repo, base };
}

async function commit(repo, message) {
  await runProcess("git", ["add", "-A"], {
    cwd: repo,
    allowFailure: false,
  });
  await runProcess(
    "git",
    ["commit", "--allow-empty", "-m", message],
    {
      cwd: repo,
      allowFailure: false,
    },
  );
}

function patch(id = "bp_ci") {
  return {
    schema: "behavectl.behavior-patch.v1",
    id,
    version: 1,
    source: {
      kind: "user_correction",
      eventId: "evt_ci",
      sourceAgent: "claude-code",
    },
    scope: { kind: "project" },
    behavior: {
      statement: "Always use pnpm for dependency operations.",
    },
    evidence: [
      {
        kind: "user_correction",
        eventId: "evt_ci",
        confidence: 0.99,
      },
    ],
    risk: "L1",
    targets: ["claude-code", "codex"],
    status: "tested",
    createdAt: new Date().toISOString(),
  };
}

function evaluation(runner, trial) {
  return {
    schema: "behavectl.evaluation.v1",
    id: `eval_${runner}_${trial}`,
    patchId: "bp_ci",
    patchDigest: behaviorPatchDigest(patch()),
    runner,
    specId: "spec_ci",
    trial,
    repeat: 3,
    createdAt: new Date().toISOString(),
    baseline: {
      passed: false,
      checks: [
        {
          id: "uses-pnpm",
          label: "Uses pnpm",
          passed: false,
        },
      ],
      observation: {
        commands: ["npm install zod"],
        metadata: {},
      },
    },
    candidate: {
      passed: true,
      checks: [
        {
          id: "uses-pnpm",
          label: "Uses pnpm",
          passed: true,
        },
      ],
      observation: {
        commands: ["pnpm add zod"],
        metadata: {},
      },
    },
    verdict: "promote",
  };
}

async function addValidBehaviorChange(repo) {
  const store = new LocalStore(repo);
  await store.init();
  await store.putPatch(patch());

  const evaluations = [];
  for (const runner of ["claude-code", "codex"]) {
    for (let trial = 1; trial <= 3; trial++) {
      const value = evaluation(runner, trial);
      evaluations.push(value);
      await store.putEvaluation(value);
    }
  }

  await store.putVerification({
    schema: "behavectl.cross-verification.v2",
    id: "verify_ci",
    patchId: "bp_ci",
    patchDigest: behaviorPatchDigest(patch()),
    specId: "spec_ci",
    repeat: 3,
    createdAt: new Date().toISOString(),
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
  });

  await promotePatch(store, "bp_ci", { force: true });
  const proof = await createBehaviorProof(store, "bp_ci");
  return { store, proof };
}

test("Behavior CI ignores ordinary code/docs diffs", async () => {
  const { repo, base } = await initRepo("behavectl-ci-no-behavior-");

  await fs.writeFile(
    path.join(repo, "README.md"),
    "# fixture\n\nordinary docs change\n",
  );
  await commit(repo, "docs");

  const result = await evaluateBehaviorCI({
    repoRoot: repo,
    baseRef: base,
  });

  assert.equal(result.status, "pass");
  assert.equal(result.verdict, "no_behavior_change");
  assert.equal(result.behaviorChanges.length, 0);
});

test("Behavior CI passes a compiled behavior change with an intact 3x3 proof", async () => {
  const { repo, base } = await initRepo("behavectl-ci-pass-");
  await addValidBehaviorChange(repo);
  await commit(repo, "agent behavior");

  const result = await evaluateBehaviorCI({
    repoRoot: repo,
    baseRef: base,
  });

  assert.equal(result.status, "pass");
  assert.equal(result.verdict, "safe_to_merge");
  assert.equal(result.proofs[0].integrity.valid, true);
  assert.ok(result.requiredTargets.includes("claude-code"));
  assert.ok(result.requiredTargets.includes("codex"));
  assert.deepEqual(result.patchIds, ["bp_ci"]);
  assert.ok(result.checks.every((check) => check.passed));

  const markdown = renderBehaviorCIMarkdown(result);
  assert.match(markdown, /SAFE TO MERGE/);
  assert.match(markdown, /Proof integrity/);
  assert.match(markdown, /6\/6 trials/);
});

test("Behavior CI blocks a tampered proof", async () => {
  const { repo, base } = await initRepo("behavectl-ci-tamper-");
  const { proof } = await addValidBehaviorChange(repo);
  await commit(repo, "agent behavior");

  const evalDir = path.join(proof.dir, "evaluations");
  const [first] = await fs.readdir(evalDir);
  const file = path.join(evalDir, first);
  const value = JSON.parse(await fs.readFile(file, "utf8"));
  value.verdict = "reject";
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");

  const result = await evaluateBehaviorCI({
    repoRoot: repo,
    baseRef: base,
  });

  assert.equal(result.status, "fail");
  assert.equal(
    result.checks.find((check) => check.id === "proof-integrity").passed,
    false,
  );
});

test("Behavior CI blocks a managed output that no longer matches its proof", async () => {
  const { repo, base } = await initRepo("behavectl-ci-binding-");
  await addValidBehaviorChange(repo);

  const agentsFile = path.join(repo, "AGENTS.md");
  const content = await fs.readFile(agentsFile, "utf8");
  await fs.writeFile(
    agentsFile,
    content.replace(
      "Always use pnpm for dependency operations.",
      "Always use npm for dependency operations.",
    ),
  );

  await commit(repo, "tamper managed output");

  const result = await evaluateBehaviorCI({
    repoRoot: repo,
    baseRef: base,
  });

  assert.equal(result.status, "fail");
  const binding = result.checks.find(
    (check) => check.id === "managed-output-binding",
  );
  assert.equal(binding.passed, false);
  assert.match(binding.detail, /AGENTS\.md/);
});

test("Behavior CI blocks unmanaged AGENTS.md changes without proof", async () => {
  const { repo, base } = await initRepo("behavectl-ci-manual-");

  await fs.writeFile(
    path.join(repo, "AGENTS.md"),
    "# Agent instructions\n\nAlways deploy directly to production.\n",
  );
  await commit(repo, "manual agent rule");

  const result = await evaluateBehaviorCI({
    repoRoot: repo,
    baseRef: base,
  });

  assert.equal(result.status, "fail");
  assert.deepEqual(result.proofs, []);
  const proofCoverage = result.checks.find(
    (check) => check.id === "proof-coverage",
  );
  assert.equal(proofCoverage.passed, false);
  assert.match(
    proofCoverage.detail,
    /No acceptable Behavior Proof found/,
  );
});

test("behavectl ci init workflow is idempotent, pinned, and needs no model secrets", async () => {
  const { repo } = await initRepo("behavectl-ci-init-");

  const first = await installBehaviorCI({
    repoRoot: repo,
    version: "0.1.0-alpha.1",
  });
  const second = await installBehaviorCI({
    repoRoot: repo,
    version: "0.1.0-alpha.1",
  });

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);

  const workflow = await fs.readFile(
    first.workflowFile,
    "utf8",
  );

  assert.match(
    workflow,
    /behavectl@0\.1\.0-alpha\.1/,
  );
  assert.match(
    workflow,
    /github\.event\.pull_request\.base\.sha/,
  );
  assert.doesNotMatch(
    workflow,
    /ANTHROPIC_API_KEY|OPENAI_API_KEY|secrets\./,
  );
  assert.match(workflow, /permissions:\n  contents: read/);
});


test("Behavior CI blocks human AGENTS.md edits even when an old valid proof exists", async () => {
  const { repo, base } = await initRepo("behavectl-ci-human-with-proof-");
  await addValidBehaviorChange(repo);
  await commit(repo, "proved behavior");

  const provedHead = (
    await runProcess("git", ["rev-parse", "HEAD"], {
      cwd: repo,
      allowFailure: false,
    })
  ).stdout.trim();

  const file = path.join(repo, "AGENTS.md");
  const content = await fs.readFile(file, "utf8");
  await fs.writeFile(
    file,
    `# Human policy\n\nNever bypass review.\n\n${content}`,
  );
  await commit(repo, "manual human agent instruction");

  const result = await evaluateBehaviorCI({
    repoRoot: repo,
    baseRef: provedHead,
  });

  assert.equal(result.status, "fail");
  const unmanaged = result.behaviorChanges.find(
    (change) => change.path === "AGENTS.md",
  );
  assert.equal(unmanaged.managed, false);
  assert.equal(unmanaged.surface, "codex-human-instructions");

  const control = result.checks.find(
    (check) => check.id === "managed-change-control",
  );
  assert.equal(control.passed, false);
  assert.match(control.detail, /AGENTS\.md/);
});

test("Behavior CI requires proof coverage for every changed Behavior Patch", async () => {
  const { repo, base } = await initRepo("behavectl-ci-multi-patch-");
  await addValidBehaviorChange(repo);

  const second = patch("bp_ci_second");
  second.behavior.statement = "Never edit generated files directly.";
  await fs.writeFile(
    path.join(repo, ".behavectl", "patches", "bp_ci_second.json"),
    JSON.stringify(second, null, 2) + "\n",
  );

  await commit(repo, "two behavior patches but one proof");

  const result = await evaluateBehaviorCI({
    repoRoot: repo,
    baseRef: base,
  });

  assert.equal(result.status, "fail");
  assert.deepEqual(
    result.patchIds,
    ["bp_ci", "bp_ci_second"],
  );

  const coverage = result.checks.find(
    (check) => check.id === "proof-coverage",
  );
  assert.equal(coverage.passed, false);
  assert.match(coverage.detail, /bp_ci_second/);
});


test("Behavior CI rejects an internally inconsistent proof even with fresh checksums", async () => {
  const { repo, base } = await initRepo("behavectl-ci-semantic-binding-");
  const { proof } = await addValidBehaviorChange(repo);
  await commit(repo, "agent behavior");

  const manifestFile = path.join(proof.dir, "manifest.json");
  const manifest = JSON.parse(
    await fs.readFile(manifestFile, "utf8"),
  );
  manifest.patchDigest = "0".repeat(64);
  await fs.writeFile(
    manifestFile,
    JSON.stringify(manifest, null, 2) + "\n",
  );

  // Recompute checksums to simulate a proof that is byte-integrity-valid
  // but semantically inconsistent.
  await writeProofIntegrity(proof.dir);

  const result = await evaluateBehaviorCI({
    repoRoot: repo,
    baseRef: base,
  });

  assert.equal(result.status, "fail");

  const integrity = result.checks.find(
    (check) => check.id === "proof-integrity",
  );
  assert.equal(integrity.passed, true);

  const binding = result.checks.find(
    (check) => check.id === "proof-semantic-binding",
  );
  assert.equal(binding.passed, false);
  assert.match(binding.detail, /digests disagree/i);
});
