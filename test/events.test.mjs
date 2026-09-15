import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { normalizeClaudeHook } from "../src/core/events.mjs";
import { detectCorrection } from "../src/core/corrections.mjs";
import { patchFromCorrection } from "../src/core/patches.mjs";

test("normalizes Claude UserPromptSubmit hook", async () => {
  const raw = JSON.parse(
    await fs.readFile(
      new URL("./fixtures/claude-user-prompt-correction.json", import.meta.url),
      "utf8",
    ),
  );
  const event = normalizeClaudeHook(raw, "/tmp/example-repo");
  assert.equal(event.schema, "behavectl.event.v1");
  assert.equal(event.source, "claude-code");
  assert.equal(event.kind, "UserPromptSubmit");
  assert.equal(event.data.prompt, raw.prompt);
  assert.equal(event.sessionId, "abc123");
});

test("detects explicit correction and generates patch", async () => {
  const raw = JSON.parse(
    await fs.readFile(
      new URL("./fixtures/claude-user-prompt-correction.json", import.meta.url),
      "utf8",
    ),
  );
  const event = normalizeClaudeHook(raw, "/tmp/example-repo");
  const correction = detectCorrection(event);
  assert.ok(correction);
  assert.ok(correction.confidence >= 0.55);
  const patch = patchFromCorrection(correction);
  assert.equal(patch.schema, "behavectl.behavior-patch.v1");
  assert.equal(patch.scope.kind, "project");
  assert.equal(patch.status, "candidate");
  assert.deepEqual(patch.targets, [correction.runSource]);
});

test("ignores ordinary task prompts", async () => {
  const raw = JSON.parse(
    await fs.readFile(
      new URL("./fixtures/claude-user-prompt-normal.json", import.meta.url),
      "utf8",
    ),
  );
  const event = normalizeClaudeHook(raw, "/tmp/example-repo");
  assert.equal(detectCorrection(event), null);
});
