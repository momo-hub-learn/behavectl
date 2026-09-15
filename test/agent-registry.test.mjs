import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalAgentId,
  canonicalizeAgentList,
  displayAgentName,
  listAgentDefinitions,
} from "../src/adapters/registry.mjs";
import { killerDemoPatch } from "../src/core/demo-repo.mjs";

test("Agent Registry canonicalizes adapters without requiring all supported agents", () => {
  assert.equal(canonicalAgentId("codex"), "codex");
  assert.equal(canonicalAgentId("cbc"), "codebuddy");
  assert.equal(canonicalAgentId("codebuddy-code"), "codebuddy");
  assert.equal(canonicalAgentId("claude"), "claude-code");
  assert.equal(displayAgentName("codebuddy"), "CodeBuddy Code");

  const resolved = canonicalizeAgentList(["codex", "cbc", "codex"]);
  assert.deepEqual(resolved.agents, ["codex", "codebuddy"]);
  assert.deepEqual(resolved.unknown, []);

  assert.ok(listAgentDefinitions().some((item) => item.id === "codebuddy"));
});

test("killer demo can declare Codex + CodeBuddy and nothing else", () => {
  const patch = killerDemoPatch({ targets: ["codex", "codebuddy"] });
  assert.deepEqual(patch.targets, ["codex", "codebuddy"]);
  assert.equal(patch.targets.includes("claude-code"), false);
});
