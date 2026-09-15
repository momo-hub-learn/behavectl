import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { compileAll } from "../src/core/compiler.mjs";

test("promotion compiles CodeBuddy behavior to its native project rule surface only when targeted", async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-codebuddy-compile-"));
  const patch = {
    id: "bp_generated",
    status: "active",
    targets: ["codebuddy"],
    behavior: {
      statement: "Never edit generated files directly. Edit source and regenerate.",
    },
  };

  const artifacts = await compileAll(repo, [patch]);
  const codebuddy = artifacts.find((item) => item.adapter === "codebuddy");
  assert.equal(codebuddy.count, 1);

  const rule = path.join(
    repo,
    ".codebuddy",
    "rules",
    "behavectl",
    "bp_generated.md",
  );
  const text = await fs.readFile(rule, "utf8");
  assert.match(text, /alwaysApply: true/);
  assert.match(text, /Never edit generated files directly/);

  await assert.rejects(fs.access(path.join(repo, "AGENTS.md")));
  await assert.rejects(fs.access(path.join(repo, ".claude", "rules", "behavectl")));

  patch.status = "retired";
  await compileAll(repo, [patch]);
  await assert.rejects(fs.access(rule));
});
