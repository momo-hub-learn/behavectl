import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalStore } from "../src/core/store.mjs";
import { createBehaviorProof } from "../src/core/proof.mjs";
import { behaviorPatchDigest } from "../src/core/fingerprint.mjs";
import {
  formatProofIntegrity,
  verifyProofIntegrity,
} from "../src/core/proof-integrity.mjs";

function patch() {
  return {
    schema: "behavectl.behavior-patch.v1",
    id: "bp_integrity",
    version: 1,
    source: {
      kind: "user_correction",
      eventId: "evt_integrity",
      sourceAgent: "claude-code",
    },
    scope: { kind: "project" },
    behavior: { statement: "Always use pnpm." },
    evidence: [],
    risk: "L1",
    targets: ["claude-code"],
    status: "tested",
    createdAt: new Date().toISOString(),
  };
}

function evaluation() {
  return {
    schema: "behavectl.evaluation.v1",
    id: "eval_integrity",
    patchId: "bp_integrity",
    patchDigest: behaviorPatchDigest(patch()),
    runner: "claude-code",
    specId: "spec_integrity",
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

async function proofFixture() {
  const repo = await fs.mkdtemp(
    path.join(os.tmpdir(), "behavectl-integrity-"),
  );
  const store = new LocalStore(repo);
  await store.init();
  await store.putPatch(patch());
  await store.putEvaluation(evaluation());
  return createBehaviorProof(store, "bp_integrity");
}

test("fresh Behavior Proof passes SHA-256 integrity verification", async () => {
  const proof = await proofFixture();
  const result = await verifyProofIntegrity(proof.dir);

  assert.equal(result.valid, true);
  assert.ok(result.checked >= 5);
  assert.equal(result.mismatched.length, 0);
  assert.equal(result.unexpected.length, 0);

  const text = formatProofIntegrity(result);
  assert.match(text, /VALID/);
  assert.match(text, /SHA256/i);
  assert.match(text, /does not prove author identity/i);
});

test("modifying an evaluation invalidates the Behavior Proof", async () => {
  const proof = await proofFixture();
  const evalDir = path.join(proof.dir, "evaluations");
  const [name] = await fs.readdir(evalDir);
  const file = path.join(evalDir, name);

  const value = JSON.parse(await fs.readFile(file, "utf8"));
  value.verdict = "reject";
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");

  const result = await verifyProofIntegrity(proof.dir);
  assert.equal(result.valid, false);
  assert.equal(result.mismatched.length, 1);
  assert.match(result.mismatched[0].path, /^evaluations\//);
});

test("adding an untracked artifact invalidates the Behavior Proof", async () => {
  const proof = await proofFixture();
  await fs.writeFile(
    path.join(proof.dir, "looks-legit.txt"),
    "PROMOTE\n",
  );

  const result = await verifyProofIntegrity(proof.dir);
  assert.equal(result.valid, false);
  assert.deepEqual(result.unexpected, ["looks-legit.txt"]);
});

test("deleting a tracked artifact invalidates the Behavior Proof", async () => {
  const proof = await proofFixture();
  await fs.rm(path.join(proof.dir, "patch.json"));

  const result = await verifyProofIntegrity(proof.dir);
  assert.equal(result.valid, false);
  assert.deepEqual(result.missing, ["patch.json"]);
});
