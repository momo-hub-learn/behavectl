import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createKillerDemoRepo,
  killerDemoSpec,
  KILLER_DEMO_PATCH_ID,
} from "../src/core/demo-repo.mjs";
import { runProcess } from "../src/core/eval/process.mjs";
import { LocalStore } from "../src/core/store.mjs";

test("killer demo makes the wrong path deterministically fail and the generated path pass", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-killer-"));
  const repo = path.join(parent, "demo");
  await createKillerDemoRepo(repo);

  const initial = await runProcess(
    "node",
    ["scripts/verify-config.mjs"],
    { cwd: repo, allowFailure: true },
  );
  assert.equal(initial.exitCode, 0);

  // Simulate the tempting baseline behavior: edit only the derived artifact.
  const distFile = path.join(repo, "dist", "app-config.json");
  const dist = JSON.parse(await fs.readFile(distFile, "utf8"));
  dist.displayName = "Beta";
  await fs.writeFile(
    distFile,
    JSON.stringify(dist, null, 2) + "\n",
  );

  const stale = await runProcess(
    "node",
    ["scripts/verify-config.mjs"],
    { cwd: repo, allowFailure: true },
  );
  assert.notEqual(stale.exitCode, 0);
  assert.match(stale.stderr, /stale/i);

  // Correct behavior: update canonical source then run the generator.
  const sourceFile = path.join(repo, "config", "app-config.source.json");
  const source = JSON.parse(await fs.readFile(sourceFile, "utf8"));
  source.displayName = "Beta";
  await fs.writeFile(
    sourceFile,
    JSON.stringify(source, null, 2) + "\n",
  );

  const generated = await runProcess(
    "node",
    ["scripts/generate-config.mjs"],
    { cwd: repo, allowFailure: false },
  );
  assert.match(generated.stdout, /generated/);

  const valid = await runProcess(
    "node",
    ["scripts/verify-config.mjs"],
    { cwd: repo, allowFailure: true },
  );
  assert.equal(valid.exitCode, 0);

  const store = new LocalStore(repo);
  const patch = await store.patch(KILLER_DEMO_PATCH_ID);
  assert.equal(patch.id, KILLER_DEMO_PATCH_ID);

  const spec = JSON.parse(
    await fs.readFile(
      path.join(
        repo,
        ".behavectl",
        "specs",
        `${KILLER_DEMO_PATCH_ID}.json`,
      ),
      "utf8",
    ),
  );

  assert.equal(spec.draft, false);
  assert.deepEqual(
    spec.checks.map((check) => check.label),
    [
      "Updates canonical source",
      "Updates generated config",
      "Runs generator",
      "Generated config is consistent",
    ],
  );

  const head = await runProcess(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: repo, allowFailure: true },
  );
  assert.equal(head.exitCode, 0);
  assert.match(head.stdout.trim(), /^[0-9a-f]{40}$/);
});


test("killer demo Behavior Spec produces a deterministic FAIL → PASS evaluation", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-killer-eval-"));
  const repo = path.join(parent, "demo");
  await createKillerDemoRepo(repo);

  const store = new LocalStore(repo);
  const patch = await store.patch(KILLER_DEMO_PATCH_ID);
  const spec = JSON.parse(
    await fs.readFile(
      path.join(
        repo,
        ".behavectl",
        "specs",
        `${KILLER_DEMO_PATCH_ID}.json`,
      ),
      "utf8",
    ),
  );

  const { evaluateBehaviorPatch } = await import(
    "../src/core/eval/engine.mjs"
  );
  const { FixtureRunner } = await import(
    "../src/core/eval/runners.mjs"
  );

  const runner = new FixtureRunner(async ({ workspace, patch: candidate }) => {
    if (!candidate) {
      const file = path.join(workspace, "dist", "app-config.json");
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      value.displayName = "Beta";
      await fs.writeFile(
        file,
        JSON.stringify(value, null, 2) + "\n",
      );

      return {
        commands: [],
        output: "edited derived file",
        exitCode: 0,
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
      "node",
      ["scripts/generate-config.mjs"],
      { cwd: workspace, allowFailure: false },
    );

    return {
      commands: ["node scripts/generate-config.mjs"],
      output: generated.stdout,
      exitCode: 0,
    };
  });

  const evaluation = await evaluateBehaviorPatch({
    repoRoot: repo,
    patch,
    spec,
    runner,
  });

  assert.equal(evaluation.baseline.passed, false);
  assert.equal(evaluation.candidate.passed, true);
  assert.equal(evaluation.verdict, "promote");

  const before = new Map(
    evaluation.baseline.checks.map((check) => [check.id, check.passed]),
  );
  const after = new Map(
    evaluation.candidate.checks.map((check) => [check.id, check.passed]),
  );

  assert.equal(before.get("source-updated"), false);
  assert.equal(after.get("source-updated"), true);
  assert.equal(before.get("runs-generator"), false);
  assert.equal(after.get("runs-generator"), true);
  assert.equal(before.get("config-consistent"), false);
  assert.equal(after.get("config-consistent"), true);
});


test("demo generator check accepts the package script alias without matching other scripts", async () => {
  const { evaluateAssertions } = await import("../src/core/eval/assertions.mjs");
  const check = killerDemoSpec().checks.find(item => item.id === "runs-generator");
  for (const [command, expected] of [
    ["node scripts/generate-config.mjs", true],
    ["node ./scripts/generate-config.mjs", true],
    ["/bin/zsh -lc 'npm run generate && npm run verify && git diff --check'", true],
    ["npm run generate", true],
    ["npm run generate-other", false],
    ["node scripts/generate-config.mjs.backup", false],
    ["npm run verify", false],
  ]) {
    const result = await evaluateAssertions({ checks: [check] }, { commands: [command] }, os.tmpdir());
    assert.equal(result.checks[0].passed, expected, command);
  }
});
