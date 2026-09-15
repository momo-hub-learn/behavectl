import test from "node:test";
import assert from "node:assert/strict";

import { ui } from "../src/ui/theme.mjs";
import { createAnsi } from "../src/ui/ansi.mjs";
import { renderProgress } from "../src/ui/review.mjs";
import { renderProductTour } from "../src/ui/tour.mjs";

test("plain visual system keeps structure without ANSI escape codes", () => {
  const v = ui({
    plain: true,
    width: 80,
  });

  const output = [
    v.header(
      "Git for AI behavior.",
      "fixture",
    ),
    v.panel(
      "STATUS",
      [
        `  ${v.statusDot("success")} ready`,
        `  ${v.statusDot("warning")} attention`,
        `  ${v.statusDot("muted")} waiting`,
      ],
      {
        tone: "violet",
      },
    ),
  ].join("\n");

  assert.match(output, /◆ BEHAVECTL/);
  assert.match(output, /● ready/);
  assert.match(output, /▲ attention/);
  assert.match(output, /○ waiting/);
  assert.doesNotMatch(output, /\x1b\[/);
});

test("running progress has a moving scanner while completed progress is stable", () => {
  const v = ui({
    plain: true,
    width: 80,
  });

  const frame0 = v.progress(
    "running",
    12,
    0,
  );
  const frame4 = v.progress(
    "running",
    12,
    4,
  );

  assert.notEqual(
    frame0,
    frame4,
  );
  assert.match(frame0, /◆/);
  assert.equal(
    v.progress(
      "done",
      12,
      99,
    ),
    "━━━━━━━━━━━━",
  );
});

test("plain UI rendering does not mutate the global NO_COLOR environment", () => {
  const before =
    process.env.NO_COLOR;

  renderProgress({
    patchId: "bp_ui",
    agent: "Claude Code",
    baseline: "done",
    candidate: "running",
    plain: true,
  });

  renderProductTour({
    plain: true,
    evaluation: {
      baseline: {
        checks: [
          {
            id: "x",
            label: "Uses policy",
            passed: false,
          },
        ],
      },
      candidate: {
        checks: [
          {
            id: "x",
            label: "Uses policy",
            passed: true,
          },
        ],
      },
    },
  });

  assert.equal(
    process.env.NO_COLOR,
    before,
  );
});

test("truecolor renderer emits 24-bit ANSI sequences for the launch palette", () => {
  const color = createAnsi({
    color: true,
  });

  const value = color.rgb(
    103,
    232,
    249,
    "BEHAVECTL",
  );

  assert.match(
    value,
    /\x1b\[38;2;103;232;249m/,
  );
  assert.match(
    value,
    /BEHAVECTL/,
  );
});
