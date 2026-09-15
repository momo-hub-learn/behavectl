import { ui } from "./theme.mjs";

export function renderProductTour({
  evaluation,
  plain = false,
}) {
  const v = ui({ plain });
  const rows = diffRows(evaluation);

  const diffLines = rows.map((row) => {
    const before =
      row.before === "PASS"
        ? v.a.rgb(134, 239, 172, "PASS")
        : v.a.rgb(251, 113, 133, "FAIL");

    const after =
      row.after === "PASS"
        ? v.a.rgb(134, 239, 172, "PASS")
        : v.a.rgb(251, 113, 133, "FAIL");

    return `  ${row.label.padEnd(24)} ${before} ${v.a.dim("→")} ${after}`;
  });

  const pipeline = [
    `${v.badge("1", "info")}  ${v.a.bold("CAPTURE")}    user correction`,
    `     ${v.a.dim("│")}`,
    `${v.badge("2", "violet")}  ${v.a.bold("PATCH")}      durable behavior change`,
    `     ${v.a.dim("│")}`,
    `${v.badge("3", "warning")}  ${v.a.bold("PROVE")}      isolated A/B + stability`,
    `     ${v.a.dim("│")}`,
    `${v.badge("4", "success")}  ${v.a.bold("PROMOTE")}    human-gated persistent behavior`,
  ];

  return [
    v.header(
      "Git for AI behavior.",
      v.badge("SIMULATION", "warning"),
    ),
    "",
    v.panel(
      "THE CONTROL LOOP",
      [
        "",
        `  ${v.a.bold("Agents already learn.")}`,
        `  ${v.a.dim(
          "Behavectl turns learning into a reviewable change",
        )}`,
        `  ${v.a.dim(
          "before it becomes policy.",
        )}`,
        "",
        ...pipeline.map((line) => `  ${line}`),
        "",
      ],
      {
        tone: "violet",
        right: "fixture only",
      },
    ),
    "",
    v.panel(
      "CAPTURED CHANGE",
      [
        "",
        `  ${v.a.dim("user")}`,
        `  ${v.a.bold(
          '"Don\'t use npm in this repo. We always use pnpm."',
        )}`,
        "",
        `  ${v.a.dim("behavior patch")}`,
        `  ${v.a.rgb(
          167,
          139,
          250,
          "+ Always use pnpm for dependency operations. Never use npm.",
        )}`,
        "",
        `  ${v.a.dim("scope")}  project     ${v.a.dim(
          "risk",
        )}  L1`,
        "",
      ],
      {
        tone: "info",
        right: "bp_demo_pnpm",
      },
    ),
    "",
    v.panel(
      "BEHAVIOR DIFF",
      [
        "",
        ...diffLines,
        "",
        `  ${v.a.dim("fixture verdict")}  ${v.badge(
          "PROMOTE",
          "success",
        )}`,
        "",
      ],
      {
        tone: "success",
        right: "before → after",
      },
    ),
    "",
    v.panel(
      "REAL PATH",
      [
        "",
        `  ${v.a.bold("Real Claude + Codex")}`,
        `       ${v.a.dim("↓")}`,
        `  ${v.a.bold("Repeated isolated A/B")}`,
        `       ${v.a.dim("↓")}`,
        `  ${v.a.bold("Behavior Proof · bound to the exact patch")}`,
        `       ${v.a.dim("↓")}`,
        `  ${v.a.bold("Human promote → Behavior CI → Rollback")}`,
        "",
        `  ${v.a.dim(
          "Nothing here touches your project or creates promotable evidence.",
        )}`,
        "",
      ],
      {
        tone: "violet",
        right: "human controlled",
      },
    ),
    "",
    `  ${v.command("behavectl demo create")}  ${v.a.dim(
      "real deterministic challenge",
    )}`,
    `  ${v.command("behavectl init")}         ${v.a.dim(
      "connect your coding agents",
    )}`,
    "",
    `  ${v.a.bold(
      "Learning can be automatic. Shipping behavior should not be.",
    )}`,
    `  ${v.a.dim(
      "SIMULATION · fixture only · no model calls · cannot unlock promotion",
    )}`,
  ].join("\n");
}

function diffRows(evaluation) {
  const before = new Map(
    evaluation.baseline.checks.map(
      (check) => [
        check.id ?? check.label,
        check,
      ],
    ),
  );
  const after = new Map(
    evaluation.candidate.checks.map(
      (check) => [
        check.id ?? check.label,
        check,
      ],
    ),
  );

  const ids = [
    ...new Set([
      ...before.keys(),
      ...after.keys(),
    ]),
  ];

  return ids.map((id) => {
    const a = before.get(id);
    const b = after.get(id);
    return {
      label:
        (b ?? a)?.label ?? id,
      before: a?.passed ? "PASS" : "FAIL",
      after: b?.passed ? "PASS" : "FAIL",
    };
  });
}
