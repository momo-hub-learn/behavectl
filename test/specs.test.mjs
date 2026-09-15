import test from "node:test";
import assert from "node:assert/strict";

import { suggestBehaviorSpec } from "../src/core/specs.mjs";

test("suggests semantic pnpm checks from behavior and repo evidence", () => {
  const spec = suggestBehaviorSpec({
    id: "bp_pnpm",
    behavior: {
      statement: "Don't use npm in this repo. We always use pnpm.",
    },
    evidence: [
      {
        kind: "package_metadata",
        key: "packageManager",
        value: "pnpm@10.4.1",
      },
    ],
  });

  assert.equal(spec.draft, true);
  assert.ok(spec.task);
  assert.deepEqual(
    spec.checks.map((check) => check.label),
    ["Uses pnpm", "Avoids npm", "No package-lock.json"],
  );
});

test("unknown behavior produces an explicit incomplete draft", () => {
  const spec = suggestBehaviorSpec({
    id: "bp_unknown",
    behavior: { statement: "Prefer the repository factory." },
    evidence: [],
  });

  assert.equal(spec.draft, true);
  assert.equal(spec.task, "");
  assert.equal(spec.checks.length, 0);
});

for (const [statement,expected] of [
  ['Always use npm instead of pnpm in this repo.', ['Uses npm','Avoids pnpm']],
  ['这个项目不要使用 npm，以后统一用 pnpm。', ['Uses pnpm','Avoids npm','No package-lock.json']],
  ['Always use pnpm.', ['Uses pnpm','No package-lock.json']],
]) test(`spec preserves intent: ${statement}`,()=>{
  const spec=suggestBehaviorSpec({id:'bp_intent',behavior:{statement},evidence:[]});
  assert.deepEqual(spec.checks.map(x=>x.label),expected);
});
test('conflicting instructions stay incomplete',()=>{
 const spec=suggestBehaviorSpec({id:'bp_conflict',behavior:{statement:'Always use npm. Always use pnpm.'},evidence:[]});
 assert.deepEqual(spec.checks,[]);
});
