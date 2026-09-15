import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  formatProtocolBundleReplay,
  formatProtocolReplay,
  replayProtocolFile,
  replayTraceBundle,
} from "../src/core/protocol-replay.mjs";
import {
  createTraceRecorder,
  verifyTraceManifest,
} from "../src/core/traces.mjs";

const fixtureRoot = new URL(
  "./fixtures/protocol/",
  import.meta.url,
);

test("Claude protocol trace replays into typed behavior signals", async () => {
  const file = new URL(
    "claude-stream-json.jsonl",
    fixtureRoot,
  );

  const report = await replayProtocolFile({
    agent: "claude",
    file,
  });

  assert.equal(report.protocolHealthy, true);
  assert.equal(report.eventCount, 2);
  assert.deepEqual(
    report.commands,
    ["node scripts/generate-config.mjs"],
  );
  assert.equal(report.toolUseCount, 1);
  assert.equal(report.terminalEventPresent, true);
  assert.equal(report.usagePresent, true);

  const output = formatProtocolReplay(report);
  assert.match(output, /Claude Code/);
  assert.match(output, /parser contract looks healthy/);
  assert.match(output, /generate-config/);
});

test("Codex protocol trace replays typed command and file-change events", async () => {
  const file = new URL(
    "codex-exec.jsonl",
    fixtureRoot,
  );

  const report = await replayProtocolFile({
    agent: "codex",
    file,
  });

  assert.equal(report.protocolHealthy, true);
  assert.equal(report.eventCount, 6);
  assert.deepEqual(
    report.commands,
    ["node scripts/generate-config.mjs"],
  );
  assert.equal(report.fileChangeCount, 1);
  assert.equal(report.terminalEventPresent, true);
  assert.equal(report.usagePresent, true);

  const output = formatProtocolReplay(report);
  assert.match(output, /command_execution/);
  assert.match(output, /turn\.completed/);
});

test("protocol replay flags a successful-looking trace without terminal event", async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "behavectl-replay-bad-"),
  );
  const file = path.join(dir, "trace.jsonl");

  await fs.writeFile(
    file,
    '{"type":"assistant","message":{"content":[]}}\n',
  );

  const report = await replayProtocolFile({
    agent: "claude",
    file,
  });

  assert.equal(report.protocolHealthy, false);
  assert.match(
    report.warnings.join("\n"),
    /No Claude result event/,
  );
});

test("trace recorder writes replay metadata and tamper-evident manifest", async () => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "behavectl-traces-"),
  );
  const recorder = createTraceRecorder(dir);

  const claude = await fs.readFile(
    new URL("claude-stream-json.jsonl", fixtureRoot),
    "utf8",
  );
  const codex = await fs.readFile(
    new URL("codex-exec.jsonl", fixtureRoot),
    "utf8",
  );

  await recorder.record({
    runner: "claude-code",
    arm: "baseline",
    stdout: claude,
    stderr: "",
  });
  await recorder.record({
    runner: "claude-code",
    arm: "candidate",
    stdout: claude,
    stderr: "",
  });
  await recorder.record({
    runner: "codex",
    arm: "baseline",
    stdout: codex,
    stderr: "",
  });
  await recorder.record({
    runner: "codex",
    arm: "candidate",
    stdout: codex,
    stderr: "",
  });

  const finalized = await recorder.finalize();

  assert.equal(
    finalized.protocolReport.healthy,
    true,
  );
  assert.equal(
    finalized.protocolReport.traces.length,
    4,
  );

  const integrity = await verifyTraceManifest(dir);
  assert.equal(integrity.valid, true);

  const bundle = await replayTraceBundle(dir);
  assert.equal(bundle.healthy, true);
  assert.equal(bundle.traceCount, 4);

  const output = formatProtocolBundleReplay(bundle);
  assert.match(output, /all captured traces replay cleanly/);
  assert.match(output, /Claude Code/);
  assert.match(output, /Codex/);

  const target = path.join(
    dir,
    "codex",
    "trial-01-candidate.jsonl",
  );
  await fs.appendFile(
    target,
    '{"type":"unexpected.test"}\n',
  );

  const tampered = await verifyTraceManifest(dir);
  assert.equal(tampered.valid, false);
  assert.equal(tampered.mismatched.length, 1);
});


test("CodeBuddy protocol trace replays through its registered adapter", async () => {
  const report = await replayProtocolFile({
    agent: "codebuddy",
    file: new URL("./fixtures/protocol/codebuddy-stream-json.jsonl", import.meta.url),
  });
  assert.equal(report.agent, "codebuddy");
  assert.equal(report.protocolHealthy, true);
  assert.deepEqual(report.commands, ["node scripts/generate-config.mjs"]);
  assert.equal(report.terminalEventPresent, true);
});
