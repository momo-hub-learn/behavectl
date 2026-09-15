import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodeBuddyArgs,
  parseCodeBuddyJsonl,
} from "../src/core/eval/runners.mjs";

test("CodeBuddy candidate behavior is injected as a system-level instruction", () => {
  const patch = {
    behavior: {
      statement:
        "Never edit dist/app-config.json directly. Edit the source and regenerate.",
    },
  };

  const args = buildCodeBuddyArgs({
    task: "Change Alpha to Beta.",
    patch,
    maxTurns: 5,
  });

  assert.ok(args.includes("-p"));
  assert.ok(args.includes("stream-json"));
  assert.ok(args.includes("--dangerously-skip-permissions"));
  assert.ok(args.includes("--no-session-persistence"));

  const systemIndex = args.indexOf("--append-system-prompt");
  assert.ok(systemIndex > 0);
  assert.match(args[systemIndex + 1], /Never edit dist\/app-config\.json directly/);
  assert.equal(args.at(-1), "Change Alpha to Beta.");
  assert.doesNotMatch(args.at(-1), /BEHAVECTL CANDIDATE PROJECT BEHAVIOR/);
});

test("CodeBuddy baseline contains no candidate instruction", () => {
  const args = buildCodeBuddyArgs({
    task: "Change Alpha to Beta.",
    patch: null,
  });

  assert.equal(args.includes("--append-system-prompt"), false);
  assert.equal(args.at(-1), "Change Alpha to Beta.");
});

test("CodeBuddy stream-json parser extracts commands, result, and usage", () => {
  const text = [
    JSON.stringify({ type: "system", subtype: "init" }),
    JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            id: "tool-1",
            name: "Bash",
            input: { command: "node scripts/generate-config.mjs" },
          },
        ],
      },
    }),
    JSON.stringify({
      type: "result",
      result: "done",
      usage: { input_tokens: 10, output_tokens: 4 },
    }),
  ].join("\n");

  const parsed = parseCodeBuddyJsonl(text);
  assert.deepEqual(parsed.commands, ["node scripts/generate-config.mjs"]);
  assert.equal(parsed.toolUses.length, 1);
  assert.equal(parsed.resultText, "done");
  assert.equal(parsed.usage.input_tokens, 10);
});
