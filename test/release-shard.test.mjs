import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalStore } from "../src/core/store.mjs";
import { verifyAcrossAgents } from "../src/core/verify.mjs";
import { createBehaviorProof } from "../src/core/proof.mjs";
import { createTraceRecorder } from "../src/core/traces.mjs";
import {
  assessReleaseShard,
  mergeReleaseShards,
} from "../src/core/release-shard.mjs";

const fixtureRoot = new URL("./fixtures/protocol/", import.meta.url);

function passingRunner(id) {
  return {
    id,
    async run({ patch: candidate }) {
      return {
        commands: candidate ? ["pnpm add zod"] : ["npm install zod"],
        output: "",
        exitCode: 0,
        metadata: {},
      };
    },
  };
}

async function buildShard(agent, { artifactBytes = Buffer.from("same candidate\n"), profile = ["claude-code", "codex"] } = {}) {
  const bundle = await fs.mkdtemp(path.join(os.tmpdir(), `behavectl-shard-${agent}-`));
  const repo = path.join(bundle, "_repo");
  await fs.mkdir(repo, { recursive: true });
  await fs.writeFile(path.join(repo, "package.json"), "{}");

  const store = new LocalStore(repo);
  await store.init();
  const patch = {
    schema: "behavectl.behavior-patch.v1",
    id: "bp_distributed_rc",
    version: 1,
    source: { kind: "user_correction", eventId: "evt_rc", sourceAgent: "codex" },
    scope: { kind: "project" },
    behavior: { statement: "Always use pnpm." },
    evidence: [],
    risk: "L1",
    targets: [...profile],
    status: "tested",
    createdAt: new Date().toISOString(),
  };
  const spec = {
    schema: "behavectl.behavior-spec.v1",
    id: "spec_distributed_rc",
    task: "Add zod.",
    checks: [{ id: "uses-pnpm", label: "Uses pnpm", kind: "command_matches", value: "pnpm" }],
  };
  await store.putPatch(patch);

  const verification = await verifyAcrossAgents({
    repoRoot: repo,
    patch,
    spec,
    repeat: 3,
    runners: [passingRunner(agent)],
  });
  for (const evaluation of verification.evaluations) await store.putEvaluation(evaluation);
  await store.putVerification(verification);
  const proof = await createBehaviorProof(store, patch.id);
  await fs.cp(proof.dir, path.join(bundle, "proof"), { recursive: true });

  const recorder = createTraceRecorder(path.join(bundle, "traces"));
  const traceText = await fs.readFile(
    new URL(
      agent === "codex"
        ? "codex-exec.jsonl"
        : agent === "codebuddy"
          ? "codebuddy-stream-json.jsonl"
          : "claude-stream-json.jsonl",
      fixtureRoot,
    ),
    "utf8",
  );
  for (let trial = 0; trial < 3; trial++) {
    for (const arm of ["baseline", "candidate"]) {
      await recorder.record({ runner: agent, arm, stdout: traceText, stderr: "" });
    }
  }
  await recorder.finalize();

  await fs.writeFile(
    path.join(bundle, "result.json"),
    JSON.stringify({
      schema: "behavectl.live-validation.v1",
      runId: `live_${agent}`,
      mode: "real",
      repeat: 3,
      patchId: patch.id,
      verificationId: verification.id,
      verdict: verification.verdict,
      coverage: verification.coverage,
    }, null, 2) + "\n",
  );
  await fs.writeFile(
    path.join(bundle, "environment.json"),
    JSON.stringify({
      schema: "behavectl.live-environment.v1",
      runId: `live_${agent}`,
      mode: "real",
      startedAt: new Date().toISOString(),
      platform: "test",
      arch: "test",
      node: "v22.0.0",
      versions: {
        git: "git version test",
        agents: { [agent]: `${agent} test` },
        claude: agent === "claude-code" ? "claude test" : null,
        codex: agent === "codex" ? "codex test" : null,
        codebuddy: agent === "codebuddy" ? "codebuddy test" : null,
      },
      repeat: 3,
    }, null, 2) + "\n",
  );

  const filename = "behavectl-0.1.0-alpha.1.tgz";
  const sha256 = crypto.createHash("sha256").update(artifactBytes).digest("hex");
  await fs.writeFile(path.join(bundle, filename), artifactBytes);
  await fs.writeFile(
    path.join(bundle, "release-artifact.json"),
    JSON.stringify({
      schema: "behavectl.release-artifact.v1",
      package: { name: "behavectl", version: "0.1.0-alpha.1" },
      artifact: { filename, bytes: artifactBytes.byteLength, sha256 },
    }, null, 2) + "\n",
  );

  const assessment = await assessReleaseShard(bundle);
  await fs.writeFile(path.join(bundle, "RC_SHARD.json"), JSON.stringify(assessment, null, 2) + "\n");
  return { bundle, assessment };
}

test("independent Claude and Codex shards merge into one GO candidate", async () => {
  const claude = await buildShard("claude-code");
  const codex = await buildShard("codex");
  assert.equal(claude.assessment.verdict, "valid");
  assert.equal(codex.assessment.verdict, "valid");

  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-merge-"));
  const merged = await mergeReleaseShards({
    shardDirs: [claude.bundle, codex.bundle],
    outputDir: path.join(parent, "rc"),
  });

  assert.equal(merged.assessment.verdict, "go");
  assert.equal(merged.assessment.protocolReplay.traceCount, 12);
  assert.equal(merged.assessment.verification.coverage.passedTrials, 6);
  await fs.access(path.join(merged.outputDir, "RELEASE_SEAL.md"));
  await fs.access(path.join(merged.outputDir, "SHARD_SOURCES.json"));
});

test("distributed RC merge rejects shards bound to different candidate artifacts", async () => {
  const claude = await buildShard("claude-code", { artifactBytes: Buffer.from("candidate A\n") });
  const codex = await buildShard("codex", { artifactBytes: Buffer.from("candidate B\n") });
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-merge-mismatch-"));

  await assert.rejects(
    mergeReleaseShards({
      shardDirs: [claude.bundle, codex.bundle],
      outputDir: path.join(parent, "rc"),
    }),
    /artifact SHA-256/,
  );
});


test("Codex and CodeBuddy can be the complete RC certification profile", async () => {
  const profile = ["codex", "codebuddy"];
  const codex = await buildShard("codex", { profile });
  const codebuddy = await buildShard("codebuddy", { profile });
  assert.equal(codex.assessment.verdict, "valid");
  assert.equal(codebuddy.assessment.verdict, "valid");

  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-merge-codebuddy-"));
  const merged = await mergeReleaseShards({
    shardDirs: [codex.bundle, codebuddy.bundle],
    outputDir: path.join(parent, "rc"),
  });

  assert.equal(merged.assessment.verdict, "go");
  assert.deepEqual(merged.assessment.certificationProfile, ["codebuddy", "codex"]);
  assert.equal(merged.assessment.protocolReplay.traceCount, 12);
  assert.equal(merged.assessment.verification.coverage.passedTrials, 6);
});
