import test from "node:test";
import assert from "node:assert/strict";

import { renderProductTour } from "../src/ui/tour.mjs";

test("product tour is compelling but impossible to confuse with a real eval", () => {
  const output = renderProductTour({
    evaluation: {
      baseline: {
        checks: [
          {
            id: "uses-pnpm",
            label: "Uses pnpm",
            passed: false,
          },
          {
            id: "avoids-npm",
            label: "Avoids npm",
            passed: false,
          },
        ],
      },
      candidate: {
        checks: [
          {
            id: "uses-pnpm",
            label: "Uses pnpm",
            passed: true,
          },
          {
            id: "avoids-npm",
            label: "Avoids npm",
            passed: true,
          },
        ],
      },
      verdict: "promote",
    },
  });

  assert.match(output, /Git for AI behavior/);
  assert.match(output, /SIMULATION/);
  assert.match(output, /fixture only/);
  assert.match(output, /cannot unlock promotion/);
  assert.match(output, /FAIL → PASS/);
  assert.match(output, /Behavior Proof/);
  assert.match(output, /Behavior CI/);
  assert.match(output, /behavectl demo create/);
  assert.doesNotMatch(output, /REAL PROOF READY/);
});
