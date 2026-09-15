import test from "node:test";
import assert from "node:assert/strict";

import { formatDoctor } from "../src/core/doctor.mjs";

test("doctor output clearly distinguishes readiness", () => {
  const text = formatDoctor({
    node: { installed: true, version: "v22" },
    git: { installed: true, version: "git version 2.46" },
    claude: { installed: false },
    codex: { installed: true, version: "codex-cli 1.0" },
    realBehaviorDiffReady: {
      claude: false,
      codex: true,
    },
  });

  assert.match(text, /Claude Code/);
  assert.match(text, /Claude Code\s+binary not found/);
  assert.match(text, /Codex\s+available/);
  assert.match(text, /authentication not checked/);
  assert.doesNotMatch(text, /ready for real eval/);
});
