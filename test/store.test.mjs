import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalStore } from "../src/core/store.mjs";

test("append-only event store and patch registry work locally", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-store-"));
  const store = new LocalStore(repo);
  await store.init();

  const event = {
    schema: "behavectl.event.v1",
    id: "evt_test",
    source: "claude-code",
    kind: "UserPromptSubmit",
    observedAt: new Date().toISOString(),
    repoRoot: repo,
    cwd: repo,
    data: { prompt: "Never use npm here." },
    rawMeta: {},
  };

  await store.appendEvent(event);
  const events = await store.events();
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "evt_test");

  await store.putPatch({
    schema: "behavectl.behavior-patch.v1",
    id: "bp_test",
    version: 1,
    source: { kind: "user_correction", eventId: "evt_test" },
    scope: { kind: "project" },
    behavior: { statement: "Never use npm here." },
    evidence: [],
    risk: "L1",
    targets: ["claude-code"],
    status: "candidate",
    createdAt: new Date().toISOString(),
  });

  const patch = await store.patch("bp_test");
  assert.equal(patch.id, "bp_test");
});
