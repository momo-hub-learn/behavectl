import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  formatLivePreflight,
  livePreflight,
  runLiveValidation,
} from "../src/core/live.mjs";
import { runProcess } from "../src/core/eval/process.mjs";

function fakeDoctor() {
  return {
    node: { installed: true, version: "v22.0.0" },
    git: { installed: true, version: "git version test" },
    claude: { installed: true, version: "claude test" },
    codex: { installed: true, version: "codex test" },
    realBehaviorDiffReady: {
      claude: true,
      codex: true,
    },
  };
}

function deterministicRunner(id) {
  return {
    id,
    async run({ workspace, patch }) {
      if (!patch) {
        const file = path.join(workspace, "dist", "app-config.json");
        const value = JSON.parse(await fs.readFile(file, "utf8"));
        value.displayName = "Beta";
        await fs.writeFile(
          file,
          JSON.stringify(value, null, 2) + "\n",
        );

        return {
          commands: [],
          output: "edited generated file",
          exitCode: 0,
          metadata: {
            tokenCount: 100,
            durationMs: 10,
          },
        };
      }

      const sourceFile = path.join(
        workspace,
        "config",
        "app-config.source.json",
      );
      const value = JSON.parse(await fs.readFile(sourceFile, "utf8"));
      value.displayName = "Beta";
      await fs.writeFile(
        sourceFile,
        JSON.stringify(value, null, 2) + "\n",
      );

      const generated = await runProcess(
        process.execPath,
        ["scripts/generate-config.mjs"],
        {
          cwd: workspace,
          allowFailure: false,
        },
      );

      return {
        commands: ["node scripts/generate-config.mjs"],
        output: generated.stdout,
        exitCode: 0,
        metadata: {
          tokenCount: 80,
          durationMs: 8,
        },
      };
    },
  };
}

test("live preflight makes real job count explicit", async () => {
  const preflight = await livePreflight({
    repeat: 3,
    doctorFn: fakeDoctor,
  });

  assert.equal(preflight.ready, true);
  assert.equal(preflight.plannedEvaluations, 6);
  assert.equal(preflight.plannedAgentInvocations, 12);

  const text = formatLivePreflight(preflight);
  assert.match(text, /Claude Code/);
  assert.match(text, /Codex/);
  assert.match(text, /Agent jobs 12/);
});


test("single-agent preflight does not require the other coding agent", async () => {
  const codexOnlyDoctor = () => ({
    node: { installed: true, version: "v22.0.0" },
    git: { installed: true, version: "git version test" },
    claude: { installed: false },
    codex: { installed: true, version: "codex test" },
    realBehaviorDiffReady: { claude: false, codex: true },
  });

  const preflight = await livePreflight({
    repeat: 3,
    doctorFn: codexOnlyDoctor,
    agents: ["codex"],
  });

  assert.equal(preflight.ready, true);
  assert.deepEqual(preflight.agents, ["codex"]);
  assert.equal(preflight.plannedEvaluations, 3);
  assert.equal(preflight.plannedAgentInvocations, 6);
  assert.doesNotMatch(formatLivePreflight(preflight), /Claude Code/);
  assert.match(formatLivePreflight(preflight), /Codex/);
});

test("Claude shard preflight does not require Codex", async () => {
  const claudeOnlyDoctor = () => ({
    node: { installed: true, version: "v22.0.0" },
    git: { installed: true, version: "git version test" },
    claude: { installed: true, version: "claude test" },
    codex: { installed: false },
    realBehaviorDiffReady: { claude: true, codex: false },
  });

  const preflight = await livePreflight({
    repeat: 3,
    doctorFn: claudeOnlyDoctor,
    agents: ["claude-code"],
  });

  assert.equal(preflight.ready, true);
  assert.deepEqual(preflight.agents, ["claude-code"]);
  assert.equal(preflight.plannedAgentInvocations, 6);
  assert.match(formatLivePreflight(preflight), /Claude Code/);
  assert.doesNotMatch(formatLivePreflight(preflight), /Codex/);
});


test("CodeBuddy-only preflight is first-class and does not require Claude or Codex", async () => {
  const doctorFn = () => ({
    node: { installed: true, version: "v22.0.0" },
    git: { installed: true, version: "git version test" },
    agents: [
      { id: "codebuddy", displayName: "CodeBuddy Code", installed: true, version: "codebuddy test" },
      { id: "codex", displayName: "Codex", installed: false },
      { id: "claude-code", displayName: "Claude Code", installed: false },
    ],
    codebuddy: { installed: true, version: "codebuddy test" },
    codex: { installed: false },
    claude: { installed: false },
  });

  const preflight = await livePreflight({ repeat: 3, doctorFn, agents: ["codebuddy"] });
  assert.equal(preflight.ready, true);
  assert.deepEqual(preflight.agents, ["codebuddy"]);
  assert.equal(preflight.plannedAgentInvocations, 6);
  const text = formatLivePreflight(preflight);
  assert.match(text, /CodeBuddy Code/);
  assert.doesNotMatch(text, /Claude Code/);
  assert.doesNotMatch(text, /Codex/);
});

test("live validation produces one shareable bundle from all trials", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-live-test-"));
  const outputDir = path.join(parent, "bundle");

  const live = await runLiveValidation({
    repeat: 2,
    outputDir,
    mode: "test",
    doctorFn: fakeDoctor,
    runners: [
      deterministicRunner("claude-code"),
      deterministicRunner("codex"),
    ],
  });

  assert.equal(live.verification.verdict, "promote");
  assert.equal(live.verification.coverage.passedTrials, 4);
  assert.equal(live.verification.coverage.totalTrials, 4);

  for (const rel of [
    "LIVE_VALIDATION.md",
    "environment.json",
    "preflight.json",
    "result.json",
    "proof/PROOF.md",
    "proof/behavior-matrix.txt",
    "proof/checksums.json",
    "challenge/config/app-config.source.json",
    "challenge/scripts/verify-config.mjs",
  ]) {
    await fs.access(path.join(outputDir, rel));
  }

  const report = await fs.readFile(
    path.join(outputDir, "LIVE_VALIDATION.md"),
    "utf8",
  );

  assert.match(report, /Behavectl Live Validation/);
  assert.match(report, /4\/4 passed/);
  assert.match(report, /Claude Code/);
  assert.match(report, /Codex/);
  assert.match(report, /SHA-256 integrity checked/);

  const result = JSON.parse(
    await fs.readFile(
      path.join(outputDir, "result.json"),
      "utf8",
    ),
  );
  assert.equal(result.proofIntegrity.valid, true);
  assert.equal(result.proofIntegrity.algorithm, "sha256");
});

test("live validation preserves a diagnostic bundle on runner infrastructure failure", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-live-fail-"));
  const outputDir = path.join(parent, "bundle");

  const broken = {
    id: "claude-code",
    async run() {
      return {
        commands: [],
        output: "",
        exitCode: 1,
        metadata: {
          stderr: "authentication required",
        },
      };
    },
  };

  await assert.rejects(
    runLiveValidation({
      repeat: 1,
      outputDir,
      mode: "test",
      doctorFn: fakeDoctor,
      runners: [broken, deterministicRunner("codex")],
    }),
    (error) =>
      error?.code === "BCTL_EVAL_RUNNER_FAILED" &&
      error?.liveBundle === outputDir,
  );

  const failure = JSON.parse(
    await fs.readFile(
      path.join(outputDir, "failure.json"),
      "utf8",
    ),
  );

  assert.equal(failure.code, "BCTL_EVAL_RUNNER_FAILED");
  assert.match(failure.message, /infrastructure error/i);
  assert.match(failure.message, /authentication required/i);

  const markdown = await fs.readFile(
    path.join(outputDir, "LIVE_VALIDATION.md"),
    "utf8",
  );
  assert.match(markdown, /FAILED/);
  assert.match(markdown, /No behavior verdict should be inferred/);
});
