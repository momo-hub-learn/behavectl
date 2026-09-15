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
  assessReleaseCandidate,
  formatReleaseCandidate,
  runReleaseCandidate,
  writeReleaseCandidateArtifacts,
} from "../src/core/release-candidate.mjs";

const fixtureRoot = new URL(
  "./fixtures/protocol/",
  import.meta.url,
);

async function writeFakeReleaseArtifact(bundle) {
  const filename = "behavectl-0.1.0-alpha.1.tgz";
  const bytes = Buffer.from("fake npm artifact for release candidate tests\n");
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  await fs.writeFile(path.join(bundle, filename), bytes);
  await fs.writeFile(
    path.join(bundle, "release-artifact.json"),
    JSON.stringify({
      schema: "behavectl.release-artifact.v1",
      package: { name: "behavectl", version: "0.1.0-alpha.1" },
      artifact: { filename, bytes: bytes.byteLength, sha256 },
    }, null, 2) + "\n",
  );
}

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

async function buildRcBundle({
  mode = "real",
  repeat = 3,
} = {}) {
  const bundle = await fs.mkdtemp(
    path.join(os.tmpdir(), "behavectl-rc-bundle-"),
  );

  const repo = path.join(bundle, "_repo");
  await fs.mkdir(repo, { recursive: true });
  await fs.writeFile(
    path.join(repo, "package.json"),
    "{}",
  );

  const store = new LocalStore(repo);
  await store.init();

  const patch = {
    schema: "behavectl.behavior-patch.v1",
    id: "bp_rc",
    version: 1,
    source: {
      kind: "user_correction",
      eventId: "evt_rc",
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
    id: "spec_rc",
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
    repeat,
    runners: [
      passingRunner("claude-code"),
      passingRunner("codex"),
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

  await fs.cp(
    proof.dir,
    path.join(bundle, "proof"),
    { recursive: true },
  );

  const traceDir = path.join(bundle, "traces");
  const recorder = createTraceRecorder(traceDir);

  const claude = await fs.readFile(
    new URL(
      "claude-stream-json.jsonl",
      fixtureRoot,
    ),
    "utf8",
  );
  const codex = await fs.readFile(
    new URL(
      "codex-exec.jsonl",
      fixtureRoot,
    ),
    "utf8",
  );

  for (let trial = 1; trial <= repeat; trial++) {
    for (const arm of ["baseline", "candidate"]) {
      await recorder.record({
        runner: "claude-code",
        arm,
        stdout: claude,
        stderr: "",
      });
      await recorder.record({
        runner: "codex",
        arm,
        stdout: codex,
        stderr: "",
      });
    }
  }
  await recorder.finalize();

  await fs.writeFile(
    path.join(bundle, "result.json"),
    JSON.stringify(
      {
        schema: "behavectl.live-validation.v1",
        runId: "live_rc",
        mode,
        repeat,
        patchId: patch.id,
        verificationId: verification.id,
        verdict: verification.verdict,
        coverage: verification.coverage,
      },
      null,
      2,
    ) + "\n",
  );

  await writeFakeReleaseArtifact(bundle);

  await fs.writeFile(
    path.join(bundle, "environment.json"),
    JSON.stringify(
      {
        schema: "behavectl.live-environment.v1",
        runId: "live_rc",
        mode,
        platform: "test",
        arch: "test",
        node: "v22.0.0",
        versions: {
          git: "git version test",
          claude: "claude test",
          codex: "codex test",
        },
        repeat,
      },
      null,
      2,
    ) + "\n",
  );

  return {
    bundle,
    verification,
  };
}

test("Release Candidate Gate returns GO for a complete 3x3 evidence bundle", async () => {
  const { bundle } = await buildRcBundle();

  const assessment = await assessReleaseCandidate(
    bundle,
  );

  assert.equal(assessment.verdict, "go");
  assert.ok(
    assessment.checks.every(
      (check) => check.passed,
    ),
  );

  const output = formatReleaseCandidate(
    assessment,
  );

  assert.match(output, /RELEASE CANDIDATE: GO/);
  assert.match(output, /Claude Code \+ Codex/);
  assert.match(output, /6\/6 passed/);

  await writeReleaseCandidateArtifacts(
    bundle,
    assessment,
  );

  for (const file of [
    "release-candidate.json",
    "RELEASE_CANDIDATE.md",
    "README_EVIDENCE.md",
    "HERO_CAPTURE.txt",
    "RELEASE_SEAL.md",
  ]) {
    await fs.access(
      path.join(bundle, file),
    );
  }
});

test("Release Candidate Gate rejects non-real validation mode", async () => {
  const { bundle } = await buildRcBundle({
    mode: "test",
  });

  const assessment = await assessReleaseCandidate(
    bundle,
  );

  assert.equal(assessment.verdict, "no-go");

  const gate = assessment.checks.find(
    (check) => check.id === "real-mode",
  );
  assert.equal(gate.passed, false);
});

test("Release Candidate Gate rejects fewer than 3 trials per agent", async () => {
  const { bundle } = await buildRcBundle({
    repeat: 2,
  });

  const assessment = await assessReleaseCandidate(
    bundle,
  );

  assert.equal(assessment.verdict, "no-go");

  const gate = assessment.checks.find(
    (check) =>
      check.id === "minimum-repetition",
  );
  assert.equal(gate.passed, false);
});

test("Release Candidate Gate rejects tampered raw traces", async () => {
  const { bundle } = await buildRcBundle();

  const trace = path.join(
    bundle,
    "traces",
    "codex",
    "trial-01-candidate.jsonl",
  );

  await fs.appendFile(
    trace,
    '{"type":"tampered"}\n',
  );

  const assessment = await assessReleaseCandidate(
    bundle,
  );

  assert.equal(assessment.verdict, "no-go");

  const gate = assessment.checks.find(
    (check) =>
      check.id === "trace-integrity",
  );
  assert.equal(gate.passed, false);
});

test("runReleaseCandidate writes launch artifacts after the live runner returns", async () => {
  const { bundle } = await buildRcBundle();

  const result = await runReleaseCandidate({
    repeat: 3,
    liveRunner: async () => ({
      outputDir: bundle,
    }),
    artifactBuilder: async () => {},
  });

  assert.equal(
    result.assessment.verdict,
    "go",
  );

  await fs.access(
    path.join(bundle, "README_EVIDENCE.md"),
  );
});

test("runReleaseCandidate binds an explicitly supplied publish artifact instead of repacking", async () => {
  const { bundle } = await buildRcBundle();
  let built = false;
  let bound = null;

  const result = await runReleaseCandidate({
    repeat: 3,
    artifactPath: "/tmp/exact-candidate.tgz",
    liveRunner: async () => ({ outputDir: bundle }),
    artifactBuilder: async () => { built = true; },
    artifactBinder: async (input) => { bound = input; },
  });

  assert.equal(result.assessment.verdict, "go");
  assert.equal(built, false);
  assert.deepEqual(bound, {
    bundleDir: bundle,
    artifactPath: "/tmp/exact-candidate.tgz",
  });
});


test("Release Candidate Gate rejects broken artifact lineage", async () => {
  const { bundle } = await buildRcBundle();

  const resultFile = path.join(
    bundle,
    "result.json",
  );
  const result = JSON.parse(
    await fs.readFile(resultFile, "utf8"),
  );
  result.verificationId = "verify_other";
  await fs.writeFile(
    resultFile,
    JSON.stringify(result, null, 2) + "\n",
  );

  const assessment =
    await assessReleaseCandidate(bundle);

  assert.equal(
    assessment.verdict,
    "no-go",
  );

  const lineage = assessment.checks.find(
    (check) =>
      check.id === "artifact-lineage",
  );
  assert.equal(lineage.passed, false);
});

test("Release Candidate Gate requires every baseline/candidate raw trace", async () => {
  const { bundle } = await buildRcBundle();

  const trace = path.join(
    bundle,
    "traces",
    "claude-code",
    "trial-03-candidate.jsonl",
  );
  await fs.rm(trace);

  const assessment =
    await assessReleaseCandidate(bundle);

  assert.equal(
    assessment.verdict,
    "no-go",
  );

  const coverage = assessment.checks.find(
    (check) =>
      check.id === "trace-coverage",
  );
  assert.equal(coverage.passed, false);

  const integrity = assessment.checks.find(
    (check) =>
      check.id === "trace-integrity",
  );
  assert.equal(integrity.passed, false);
});


test("Release Candidate Gate rejects a tampered publish artifact", async () => {
  const { bundle } = await buildRcBundle();
  await fs.appendFile(
    path.join(bundle, "behavectl-0.1.0-alpha.1.tgz"),
    "tampered",
  );

  const assessment = await assessReleaseCandidate(bundle);
  assert.equal(assessment.verdict, "no-go");
  const gate = assessment.checks.find((check) => check.id === "release-artifact");
  assert.equal(gate.passed, false);
  assert.match(gate.detail, /SHA-256 mismatch/);
});
