import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LocalStore } from "../src/core/store.mjs";
import {
  buildHomeModel,
  nextAction,
  renderHome,
} from "../src/ui/home.mjs";

const health = {
  claude: { installed: true },
  codex: { installed: true },
  realBehaviorDiffReady: {
    claude: true,
    codex: true,
  },
};

test("uninitialized home is read-only and points to init", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-home-empty-"));
  const store = new LocalStore(repo);

  const model = await buildHomeModel({
    store,
    repoRoot: repo,
    health,
  });

  const output = renderHome(model, { plain: true });

  assert.equal(model.initialized, false);
  assert.match(output, /behavectl init/);
  assert.match(output, /Read-only until you explicitly initialize/);

  await assert.rejects(
    fs.access(path.join(repo, ".behavectl")),
  );
});

test("home screen gives one clear next action after init", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-home-"));
  const store = new LocalStore(repo);
  await store.init();

  const model = await buildHomeModel({
    store,
    repoRoot: repo,
    health,
  });

  const output = renderHome(model, { plain: true });

  assert.match(output, /BEHAVECTL/);
  assert.match(output, /Git for AI behavior/);
  assert.match(output, /Claude Code\s+available/);
  assert.match(output, /Codex\s+available/);
  assert.match(output, /Keep working normally/);
  assert.match(output, /behavectl inbox/);
  assert.match(output, /No cloud\. No daemon\. No silent promotion\./);
});

test("unprocessed events outrank candidate review in next-action routing", () => {
  const next = nextAction({
    events: { unprocessed: 2 },
    patches: { tested: 1, candidates: 3 },
    agents: { claude: true, codex: true },
  });

  assert.equal(next.command, "behavectl learn");
  assert.match(next.title, /2 new agent events/);
});

test("tested behavior routes directly to review", () => {
  const next = nextAction({
    events: { unprocessed: 0 },
    patches: { tested: 1, candidates: 0 },
    agents: { claude: true, codex: true },
  });

  assert.equal(next.command, "behavectl review");
  assert.match(next.title, /tested behavior change/);
});

test("no detected agents routes to explicit connection guidance", () => {
  const next = nextAction({
    events: { unprocessed: 0 },
    patches: { tested: 0, candidates: 0 },
    agents: { claude: false, codex: false },
  });

  assert.match(next.command, /behavectl agents/);
});
