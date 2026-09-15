import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodexExecArgs,
} from "../src/core/eval/runners.mjs";

test("Codex candidate behavior is a developer instruction, not mixed into user task", () => {
  const patch = {
    behavior: {
      statement:
        "Never edit dist/app-config.json directly. Edit the source and regenerate.",
    },
  };

  const args = buildCodexExecArgs({
    task: "Change Alpha to Beta.",
    patch,
  });

  assert.deepEqual(args.slice(0, 7), [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--sandbox",
    "workspace-write",
  ]);

  const configIndex = args.indexOf("-c");
  assert.ok(configIndex > 0);
  assert.match(
    args[configIndex + 1],
    /^developer_instructions=/,
  );
  assert.match(
    args[configIndex + 1],
    /Never edit dist\/app-config\.json directly/,
  );

  assert.equal(args.at(-1), "Change Alpha to Beta.");
  assert.doesNotMatch(
    args.at(-1),
    /BEHAVECTL CANDIDATE PROJECT BEHAVIOR/,
  );
});

test("Codex baseline has no candidate developer instruction", () => {
  const args = buildCodexExecArgs({
    task: "Change Alpha to Beta.",
    patch: null,
  });

  assert.equal(args.includes("-c"), false);
  assert.equal(args.at(-1), "Change Alpha to Beta.");
  assert.ok(args.includes("workspace-write"));
});
