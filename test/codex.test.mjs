import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { normalizeCodexHook } from "../src/adapters/codex/events.mjs";
import { installCodexHooks } from "../src/adapters/codex/hooks.mjs";
import { detectCorrection } from "../src/core/corrections.mjs";

test("normalizes Codex UserPromptSubmit and detects correction", async () => {
  const raw = JSON.parse(
    await fs.readFile(
      new URL("./fixtures/codex-user-prompt-correction.json", import.meta.url),
      "utf8",
    ),
  );
  const event = normalizeCodexHook(raw, "/tmp/example-repo");
  assert.equal(event.source, "codex");
  assert.equal(event.turnId, "turn_456");
  assert.equal(event.rawMeta.model, "gpt-5.6-sol");
  const correction = detectCorrection(event);
  assert.ok(correction);
  assert.equal(correction.kind, "explicit_rule");
});

test("Codex hook install is additive and idempotent", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-codex-"));
  const dir = path.join(repo, ".codex");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "hooks.json");

  await fs.writeFile(
    file,
    JSON.stringify({
      description: "existing",
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "echo existing" }] }],
      },
    }),
  );

  const first = await installCodexHooks(repo, "/tmp/project/.behavectl/hooks/capture.mjs");
  const second = await installCodexHooks(repo, "/tmp/project/.behavectl/hooks/capture.mjs");

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);

  const saved = JSON.parse(await fs.readFile(file, "utf8"));
  assert.equal(saved.description, "existing");
  assert.equal(saved.hooks.Stop.length, 2);
  assert.ok(saved.hooks.UserPromptSubmit);
  assert.ok(saved.hooks.PostToolUse);
  assert.ok(saved.hooks.SessionEnd);
});
