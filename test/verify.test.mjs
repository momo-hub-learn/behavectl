import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  formatBehaviorMatrix,
  verifyAcrossAgents,
} from "../src/core/verify.mjs";

function runner(id) {
  return {
    id,
    async run({ workspace, patch }) {
      if (patch) {
        return {
          commands: ["pnpm add zod"],
          output: "",
          exitCode: 0,
          metadata: {
            tokenCount: id === "claude-code" ? 9000 : 10000,
            durationMs: 3000,
          },
        };
      }

      await fs.writeFile(
        path.join(workspace, "package-lock.json"),
        "{}",
      );

      return {
        commands: ["npm install zod"],
        output: "",
        exitCode: 0,
        metadata: {
          tokenCount: id === "claude-code" ? 12000 : 13000,
          durationMs: 4000,
        },
      };
    },
  };
}

test("cross-agent verification produces one aligned Behavior Matrix", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-cross-"));
  await fs.writeFile(path.join(repo, "package.json"), "{}");

  const patch = {
    id: "bp_cross",
    behavior: { statement: "Always use pnpm. Never use npm." },
  };

  const spec = {
    id: "spec_cross",
    task: "Add zod.",
    checks: [
      {
        id: "uses-pnpm",
        label: "Uses pnpm",
        kind: "command_matches",
        value: "pnpm\\s+add\\s+zod",
      },
      {
        id: "avoids-npm",
        label: "Avoids npm",
        kind: "command_not_matches",
        value: "npm\\s+install",
      },
      {
        id: "no-package-lock",
        label: "No package-lock.json",
        kind: "file_not_exists",
        value: "package-lock.json",
      },
    ],
  };

  const result = await verifyAcrossAgents({
    repoRoot: repo,
    patch,
    spec,
    runners: [runner("claude-code"), runner("codex")],
  });

  assert.equal(result.verdict, "promote");
  assert.equal(result.coverage.passed, 2);
  assert.equal(result.coverage.total, 2);

  const matrix = formatBehaviorMatrix(result);
  assert.match(matrix, /Claude Code/);
  assert.match(matrix, /Codex/);
  assert.match(matrix, /Uses pnpm/);
  assert.match(matrix, /FAIL → PASS/);
  assert.match(matrix, /2\/2 agents passed/);
  assert.match(matrix, /READY TO PROMOTE/);
});


test("repeated verification renders trial pass rates instead of cherry-picking one run", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-stable-"));
  await fs.writeFile(path.join(repo, "package.json"), "{}");

  const patch = {
    id: "bp_stable",
    behavior: { statement: "Always use pnpm." },
  };

  const spec = {
    id: "spec_stable",
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

  const result = await verifyAcrossAgents({
    repoRoot: repo,
    patch,
    spec,
    repeat: 3,
    runners: [runner("claude-code"), runner("codex")],
  });

  assert.equal(result.verdict, "promote");
  assert.equal(result.repeat, 3);
  assert.equal(result.coverage.passedTrials, 6);
  assert.equal(result.coverage.totalTrials, 6);
  assert.equal(result.agents[0].passedTrials, 3);

  const matrix = formatBehaviorMatrix(result);
  assert.match(matrix, /0\/3 → 3\/3/);
  assert.match(matrix, /Claude Code\s+3\/3 trials/);
  assert.match(matrix, /Codex\s+3\/3 trials/);
  assert.match(matrix, /Trials: 6\/6 passed/);
  assert.match(matrix, /STABLE ENOUGH TO PROMOTE/);
});


test("one failed trial blocks the stability gate", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-flaky-"));
  await fs.writeFile(path.join(repo, "package.json"), "{}");

  const patch = {
    id: "bp_flaky",
    behavior: { statement: "Always use pnpm." },
  };

  const spec = {
    id: "spec_flaky",
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

  let candidateRuns = 0;
  const flaky = {
    id: "claude-code",
    async run({ patch: candidate }) {
      if (!candidate) {
        return {
          commands: ["npm install zod"],
          output: "",
          exitCode: 0,
          metadata: {},
        };
      }

      candidateRuns += 1;
      return {
        commands:
          candidateRuns === 2
            ? ["npm install zod"]
            : ["pnpm add zod"],
        output: "",
        exitCode: 0,
        metadata: {},
      };
    },
  };

  const result = await verifyAcrossAgents({
    repoRoot: repo,
    patch,
    spec,
    repeat: 3,
    runners: [flaky],
  });

  assert.equal(result.verdict, "mixed");
  assert.equal(result.coverage.passed, 0);
  assert.equal(result.coverage.passedTrials, 2);

  const matrix = formatBehaviorMatrix(result);
  assert.match(matrix, /0\/3 → 2\/3/);
  assert.match(matrix, /Claude Code\s+2\/3 trials/);
  assert.match(matrix, /NOT STABLE/);
});


test("declared target coverage is required for a promote verdict", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-target-cover-"));
  await fs.writeFile(path.join(repo, "package.json"), "{}");

  const patch = {
    schema: "behavectl.behavior-patch.v1",
    id: "bp_targets",
    version: 1,
    scope: { kind: "project" },
    behavior: { statement: "Always use pnpm." },
    risk: "L1",
    targets: ["claude-code", "codex"],
  };

  const spec = {
    schema: "behavectl.behavior-spec.v1",
    id: "spec_targets",
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

  const result = await verifyAcrossAgents({
    repoRoot: repo,
    patch,
    spec,
    runners: [runner("claude-code")],
  });

  assert.equal(result.verdict, "mixed");
  assert.deepEqual(
    result.coverage.missingTargets,
    ["codex"],
  );

  const matrix = formatBehaviorMatrix(result);
  assert.match(matrix, /Missing targets: Codex/);
  assert.match(matrix, /NOT READY/);
});
