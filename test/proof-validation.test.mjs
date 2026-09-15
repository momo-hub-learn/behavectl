import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalStore } from "../src/core/store.mjs";
import { verifyAcrossAgents } from "../src/core/verify.mjs";
import { createBehaviorProof } from "../src/core/proof.mjs";
import { writeProofIntegrity } from "../src/core/proof-integrity.mjs";
import {
  formatBehaviorProofValidation,
  validateBehaviorProof,
} from "../src/core/proof-validation.mjs";

function runner(id) {
  return {
    id,
    async run({ patch }) {
      return {
        commands: patch
          ? ["pnpm add zod"]
          : ["npm install zod"],
        output: "",
        exitCode: 0,
        metadata: {},
      };
    },
  };
}

async function createProofFixture() {
  const repo = await fs.mkdtemp(
    path.join(os.tmpdir(), "behavectl-proof-validation-"),
  );
  await fs.writeFile(
    path.join(repo, "package.json"),
    "{}",
  );

  const store = new LocalStore(repo);
  await store.init();

  const patch = {
    schema: "behavectl.behavior-patch.v1",
    id: "bp_validation",
    version: 1,
    source: {
      kind: "user_correction",
      eventId: "evt_validation",
      sourceAgent: "claude-code",
    },
    scope: { kind: "project" },
    behavior: {
      statement: "Always use pnpm.",
    },
    evidence: [],
    risk: "L1",
    targets: ["claude-code", "codex"],
    status: "tested",
    createdAt: new Date().toISOString(),
  };

  const spec = {
    schema: "behavectl.behavior-spec.v1",
    id: "spec_validation",
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

  await store.putPatch(patch);

  const verification = await verifyAcrossAgents({
    repoRoot: repo,
    patch,
    spec,
    runners: [
      runner("claude-code"),
      runner("codex"),
    ],
  });

  for (const evaluation of verification.evaluations) {
    await store.putEvaluation(evaluation);
  }
  await store.putVerification(verification);

  const proof = await createBehaviorProof(
    store,
    patch.id,
  );

  return proof.dir;
}

test("full Behavior Proof validation requires integrity and semantic binding", async () => {
  const proofDir = await createProofFixture();

  const result =
    await validateBehaviorProof(proofDir);

  assert.equal(result.valid, true);
  assert.equal(result.integrity.valid, true);
  assert.equal(result.binding.valid, true);

  const output =
    formatBehaviorProofValidation(result);

  assert.match(output, /Behavior Proof verification/);
  assert.match(output, /Byte integrity/);
  assert.match(output, /Semantic binding/);
  assert.match(output, /✓ VALID/);
});

test("fresh checksums cannot hide a semantically broken proof", async () => {
  const proofDir = await createProofFixture();

  const manifestFile = path.join(
    proofDir,
    "manifest.json",
  );
  const manifest = JSON.parse(
    await fs.readFile(manifestFile, "utf8"),
  );

  manifest.patchDigest = "f".repeat(64);

  await fs.writeFile(
    manifestFile,
    JSON.stringify(manifest, null, 2) + "\n",
  );

  // Re-sign byte integrity locally; semantic verification must still fail.
  await writeProofIntegrity(proofDir);

  const result =
    await validateBehaviorProof(proofDir);

  assert.equal(result.integrity.valid, true);
  assert.equal(result.binding.valid, false);
  assert.equal(result.valid, false);

  const output =
    formatBehaviorProofValidation(result);

  assert.match(output, /Byte integrity/);
  assert.match(output, /Manifest binds exact patch/);
  assert.match(output, /✗ INVALID/);
});
