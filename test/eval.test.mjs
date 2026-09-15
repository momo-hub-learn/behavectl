import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  evaluateBehaviorPatch,
  formatBehaviorDiff,
} from "../src/core/eval/engine.mjs";
import { FixtureRunner, parseClaudeJsonl, parseCodexJsonl } from "../src/core/eval/runners.mjs";
import { LocalStore } from "../src/core/store.mjs";
import { promotePatch } from "../src/core/lifecycle.mjs";

const patch = {
  schema: "behavectl.behavior-patch.v1",
  id: "bp_eval",
  version: 1,
  source: { kind: "user_correction", eventId: "evt" },
  scope: { kind: "project" },
  behavior: { statement: "Always use pnpm for dependency operations." },
  evidence: [],
  risk: "L1",
  targets: ["claude-code", "codex"],
  status: "candidate",
  createdAt: new Date().toISOString(),
};

const spec = {
  id: "pnpm",
  task: "Add zod",
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

test("A/B engine produces an improving Behavior Diff", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-eval-"));
  await fs.writeFile(path.join(repo, "package.json"), "{}");

  const runner = new FixtureRunner(async ({ workspace, patch: candidate }) => {
    if (candidate) {
      return {
        commands: ["pnpm add zod"],
        output: "",
        exitCode: 0,
      };
    }

    await fs.writeFile(path.join(workspace, "package-lock.json"), "{}");
    return {
      commands: ["npm install zod"],
      output: "",
      exitCode: 0,
    };
  });

  const result = await evaluateBehaviorPatch({
    repoRoot: repo,
    patch,
    spec,
    runner,
  });

  assert.equal(result.baseline.passed, false);
  assert.equal(result.candidate.passed, true);
  assert.equal(result.verdict, "promote");

  const text = formatBehaviorDiff(result);
  assert.match(text, /Behavior Diff/);
  assert.match(text, /Before/);
  assert.match(text, /After/);
  assert.match(text, /Uses pnpm/);
  assert.match(text, /No package-lock\.json/);
  assert.match(text, /PROMOTE/);
  assert.match(text, /fixture/);
});

test("Claude stream-json parser reads Bash tool_use blocks", () => {
  const parsed = parseClaudeJsonl(
    [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "tool_1",
              name: "Bash",
              input: { command: "pnpm add zod" },
            },
          ],
        },
      }),
      JSON.stringify({
        type: "result",
        result: "done",
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    ].join("\n"),
  );

  assert.deepEqual(parsed.commands, ["pnpm add zod"]);
  assert.equal(parsed.toolUses.length, 1);
  assert.equal(parsed.resultText, "done");
  assert.equal(parsed.usage.input_tokens, 10);
});

test("Codex exec JSONL parser follows official command_execution schema", () => {
  const parsed = parseCodexJsonl(
    [
      JSON.stringify({ type: "thread.started", thread_id: "thr_1" }),
      JSON.stringify({
        type: "item.started",
        item: {
          id: "item_1",
          type: "command_execution",
          command: "pnpm add zod",
          aggregated_output: "",
          exit_code: null,
          status: "in_progress",
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          id: "item_1",
          type: "command_execution",
          command: "pnpm add zod",
          aggregated_output: "done",
          exit_code: 0,
          status: "completed",
        },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: {
          input_tokens: 100,
          cached_input_tokens: 20,
          cache_write_input_tokens: 0,
          output_tokens: 15,
          reasoning_output_tokens: 5,
        },
      }),
    ].join("\n"),
  );

  assert.deepEqual(parsed.commands, ["pnpm add zod"]);
  assert.equal(parsed.commandItems.length, 2);
  assert.equal(parsed.usage.output_tokens, 15);
});

test("promotion is blocked without a passing real Behavior Diff", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-gate-"));
  const store = new LocalStore(repo);
  await store.init();
  await store.putPatch(patch);

  await assert.rejects(
    promotePatch(store, patch.id),
    /no real Verification Run/i,
  );
});


test("Behavior Diff renders optional work metrics without hiding semantic checks", () => {
  const evaluation = {
    patchId: "bp_metrics",
    runner: "claude-code",
    verdict: "promote",
    baseline: {
      checks: [
        { id: "uses-pnpm", label: "Uses pnpm", passed: false },
      ],
      observation: {
        commands: ["npm install"],
        metadata: {
          tokenCount: 14200,
          toolUseCount: 8,
          durationMs: 12400,
        },
      },
    },
    candidate: {
      checks: [
        { id: "uses-pnpm", label: "Uses pnpm", passed: true },
      ],
      observation: {
        commands: ["pnpm add zod"],
        metadata: {
          tokenCount: 11800,
          toolUseCount: 5,
          durationMs: 9100,
        },
      },
    },
  };

  const text = formatBehaviorDiff(evaluation);
  assert.match(text, /Uses pnpm/);
  assert.match(text, /Work/);
  assert.match(text, /Tokens/);
  assert.match(text, /Tool calls/);
  assert.match(text, /Time/);
});


test("runner infrastructure failure is not converted into a behavior verdict", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-infra-fail-"));
  await fs.writeFile(path.join(repo, "package.json"), "{}");

  const runner = new FixtureRunner(async () => ({
    commands: [],
    output: "",
    exitCode: 1,
    metadata: {
      stderr: "authentication required",
    },
  }));
  runner.id = "claude-code";

  await assert.rejects(
    evaluateBehaviorPatch({
      repoRoot: repo,
      patch,
      spec,
      runner,
    }),
    (error) =>
      error?.code === "BCTL_EVAL_RUNNER_FAILED" &&
      /infrastructure error/i.test(error.message) &&
      /authentication required/i.test(error.message),
  );
});

test('A/B evidence retains real file edits after workspace cleanup and excludes setup', async t => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'behavectl-content-'));
  t.after(() => fs.rm(repo, { recursive: true, force: true }));
  await fs.writeFile(path.join(repo, 'source.txt'), 'original\n');
  await fs.writeFile(path.join(repo, 'remove.txt'), 'old\n');
  await fs.writeFile(path.join(repo, 'binary.bin'), Buffer.from([0, 1, 2]));
  await fs.writeFile(path.join(repo, 'large.txt'), 'x'.repeat(65537));
  await fs.symlink(path.join(repo, 'source.txt'), path.join(repo, 'link.txt'));
  const workspaces = [];
  const runner = new FixtureRunner(async ({ workspace, patch: candidate }) => {
    workspaces.push(workspace);
    await fs.writeFile(path.join(workspace, 'source.txt'), candidate ? 'correct\n' : 'wrong\n');
    await fs.writeFile(path.join(workspace, 'new.txt'), 'new\n');
    await fs.unlink(path.join(workspace, 'remove.txt'));
    return { commands: [], output: '', exitCode: 0 };
  });
  const result = await evaluateBehaviorPatch({ repoRoot: repo, patch, runner, spec: {
    id: 'content', task: 'Change source', setupCommands: ['node -e "require(\'fs\').writeFileSync(\'setup.txt\', \'ready\')"'],
    checks: [{ id: 'exists', label: 'Source remains', kind: 'file_exists', value: 'source.txt' }],
  }});
  for (const [arm, text] of [[result.baseline, 'wrong\n'], [result.candidate, 'correct\n']]) {
    assert.deepEqual(arm.observation.fileChanges, [
      { path: 'new.txt', kind: 'created', before: null, after: 'new\n' },
      { path: 'remove.txt', kind: 'deleted', before: 'old\n', after: null },
      { path: 'source.txt', kind: 'modified', before: 'original\n', after: text },
    ]);
    assert.deepEqual(arm.observation.fileContentOmissions.map(x => x.path), ['binary.bin', 'large.txt']);
    assert.ok(!arm.observation.filesCreated.includes('setup.txt'));
  }
  for (const workspace of workspaces) await assert.rejects(fs.access(workspace), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(repo, 'source.txt'), 'utf8'), 'original\n');
});
