import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodexExecArgs,
  countCodexTokens,
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


test("Codex usage counts cached input and reasoning only once", () => {
  assert.equal(countCodexTokens({input_tokens:100,cached_input_tokens:20,output_tokens:15,reasoning_output_tokens:5}),115);
  assert.equal(countCodexTokens({input_tokens:50481,cached_input_tokens:39680,output_tokens:326}),50807);
  assert.equal(countCodexTokens({input_tokens:0,output_tokens:0}),0);
  for (const usage of [undefined,{}, {input_tokens:100}, {input_tokens:-1,output_tokens:2}, {input_tokens:Infinity,output_tokens:2}]) assert.equal(countCodexTokens(usage),null);
});
