import fs from "node:fs/promises";
import readline from "node:readline";
import path from "node:path";
import { ansi } from "./ansi.mjs";
import { ui } from "./theme.mjs";
import { defaultSpecPath, writeSuggestedSpec } from "../core/specs.mjs";
import { loadBehaviorSpec, formatBehaviorDiff } from "../core/eval/engine.mjs";
import { behaviorPatchDigest, behaviorSpecDigest } from "../core/fingerprint.mjs";
import { formatBehaviorMatrix } from "../core/verify.mjs";

const W = 72;

function truncate(text, width) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length <= width ? s : `${s.slice(0, Math.max(0, width - 1))}…`;
}

function line(char = "─") {
  return char.repeat(W);
}

function evidenceLabel(item) {
  if (item.kind === "user_correction") {
    const pct = Math.round(Number(item.confidence ?? 0) * 100);
    return `Explicit user correction · ${pct}% confidence`;
  }
  if (item.kind === "repo_file") {
    const fact = String(item.fact ?? "").replace(new RegExp(`^${item.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[·:—-]?\\s*`, "i"), "");
    return fact ? `${item.path} · ${fact}` : item.path;
  }
  if (item.kind === "package_metadata") return `${item.key} = ${item.value}`;
  return item.kind;
}

async function latestEvaluations(store, patchId) {
  const all = await store.evaluationsForPatch(patchId);
  const latest = new Map();

  for (const evaluation of all.sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  )) {
    if (evaluation.runner === "fixture") continue;
    if (!latest.has(evaluation.runner)) {
      latest.set(evaluation.runner, evaluation);
    }
  }

  return [...latest.values()];
}

async function latestVerification(store, patchId) {
  const all = await store.verificationsForPatch(patchId);

  return all
    .filter(
      (verification) =>
        Array.isArray(verification.evaluations) &&
        verification.evaluations.length > 0 &&
        verification.evaluations.every(
          (evaluation) => evaluation.runner !== "fixture",
        ),
    )
    .sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)),
    )[0] ?? null;
}

export async function buildReviewModel(store, patch) {
  let spec = null;
  const specPath = await defaultSpecPath(store, patch.id);
  if (specPath) {
    try {
      spec = await loadBehaviorSpec(specPath);
    } catch {
      // Keep editable drafts visible even before a runnable task exists.
      try {
        const draft = JSON.parse(await fs.readFile(specPath, "utf8"));
        if (draft?.draft === true) spec = draft;
      } catch {}
    }
  }

  const evaluations = await latestEvaluations(store, patch.id);
  const evaluation = evaluations[0] ?? null;
  const verification = await latestVerification(
    store,
    patch.id,
  );

  return {
    patch,
    spec,
    specPath,
    evaluation,
    evaluations,
    verification,
    verificationCurrent: Boolean(verification && spec && !spec.draft &&
      verification.patchDigest === behaviorPatchDigest(patch) &&
      verification.specDigest === behaviorSpecDigest(spec)),
  };
}

export function renderReview(
  model,
  { plain = false } = {},
) {
  const v = ui({ plain });
  const {
    patch,
    spec,
    evaluation,
  } = model;

  const statusTone =
    patch.status === "active"
      ? "success"
      : patch.status === "tested"
        ? "info"
        : patch.status === "candidate"
          ? "warning"
          : "muted";

  const evidence = patch.evidence?.length
    ? patch.evidence
        .slice(0, 5)
        .map(
          (item) =>
            `  ${v.statusDot(
              "success",
            )} ${truncate(
              evidenceLabel(item),
              v.width - 10,
            )}`,
        )
    : [
        `  ${v.statusDot(
          "muted",
        )} No supporting evidence attached yet`,
      ];

  const targets =
    (patch.targets ?? []).length
      ? (patch.targets ?? [])
          .map((target) =>
            v.badge(
              displayAgent(target),
              target === "claude-code"
                ? "info"
                : "violet",
            ),
          )
          .join("  ")
      : v.a.dim("none");

  const specLines = [];
  if (spec?.checks?.length) {
    for (const check of spec.checks) {
      specLines.push(
        `  ${v.statusDot(
          spec.draft ? "muted" : "info",
        )} ${truncate(
          check.label,
          v.width - 10,
        )}`,
      );
    }

    if (spec.draft) {
      specLines.push("");
      specLines.push(
        `  ${v.badge(
          "DRAFT SPEC",
          "warning",
        )}  ${v.a.dim(
          "human review required before real evaluation",
        )}`,
      );
    }
  } else {
    specLines.push(
      `  ${v.statusDot(
        "muted",
      )} No Behavior Spec yet`,
    );
    specLines.push(
      `  ${v.command(
        `behavectl spec ${patch.id}`,
      )}`,
    );
  }

  const out = [
    v.header(
      "Behavior change review",
      `${v.badge(
        patch.status,
        statusTone,
      )}  ${v.badge(
        patch.risk ?? "RISK ?",
        "neutral",
      )}`,
    ),
    "",
    v.panel(
      "What changed",
      [
        "",
        `  ${v.a.dim(patch.id)}`,
        `  ${v.a.bold(
          truncate(
            patch.behavior.statement,
            v.width - 8,
          ),
        )}`,
        "",
      ],
      {
        tone: "violet",
        right: patch.scope?.kind ?? "unknown scope",
      },
    ),
    "",
    v.panel(
      "WHY IT SURFACED",
      [
        "",
        ...evidence,
        "",
      ],
      {
        tone: "info",
        right: `${patch.evidence?.length ?? 0} signal${
          (patch.evidence?.length ?? 0) === 1
            ? ""
            : "s"
        }`,
      },
    ),
    "",
    v.panel(
      "Scope & targets",
      [
        "",
        `  ${v.a.dim("scope")}    ${v.a.bold(
          patch.scope?.kind ?? "unknown",
        )}`,
        `  ${v.a.dim("targets")}  ${targets}`,
        "",
      ],
      {
        tone: "neutral",
      },
    ),
    "",
    v.panel(
      "EXPECTED BEHAVIOR",
      [
        "",
        ...specLines,
        "",
      ],
      {
        tone:
          spec?.draft
            ? "warning"
            : spec
              ? "info"
              : "neutral",
      },
    ),
  ];

  if (
    model.verification?.evaluations?.length > 1
  ) {
    const matrix = formatBehaviorMatrix(
      model.verification,
    )
      .split("\n")
      .slice(2)
      .filter(Boolean)
      .map(
        (row) =>
          `  ${colorMatrixRow(
            truncate(
              row,
              v.width - 8,
            ),
            v,
          )}`,
      );

    const stable =
      model.verification.verdict === "promote" &&
      !(
        model.verification.coverage
          ?.missingTargets?.length
      );

    out.push(
      "",
      v.panel(
        "Cross-Agent Verification",
        [
          "",
          ...matrix,
          "",
          `  ${
            stable
              ? v.badge(
                  "READY TO PROMOTE",
                  "success",
                )
              : v.badge(
                  "NOT READY",
                  "warning",
                )
          }`,
          "",
        ],
        {
          tone: stable
            ? "success"
            : "warning",
          right: "stability gate",
        },
      ),
    );
  } else if (evaluation) {
    const beforeMeta =
      evaluation.baseline?.observation
        ?.metadata ?? {};
    const afterMeta =
      evaluation.candidate?.observation
        ?.metadata ?? {};
    const work = compactWork(
      beforeMeta,
      afterMeta,
      v,
    );

    const lines = [
      "",
      ...compactDiff(
        evaluation,
        v,
      ).map((row) => `  ${row}`),
      "",
      `  ${v.a.dim(
        "verdict",
      )}  ${verdictBadge(
        evaluation.verdict,
        v,
      )}`,
    ];

    if (work.length) {
      lines.push("");
      lines.push(
        `  ${v.a.dim(
          "work",
        )}`,
      );
      lines.push(
        ...work.map(
          (row) => `  ${row}`,
        ),
      );
    }

    lines.push("");

    out.push(
      "",
      v.panel(
        "LATEST BEHAVIOR DIFF",
        lines,
        {
          tone:
            evaluation.verdict === "promote"
              ? "success"
              : evaluation.verdict === "reject"
                ? "danger"
                : "warning",
          right: "before → after",
        },
      ),
    );
  }

  out.push(
    "",
    v.panel(
      "ACTIONS",
      actionLines(model, v),
      {
        tone: "violet",
        right: "keyboard",
      },
    ),
  );

  return out.join("\n");
}


function colorMatrixRow(
  row,
  v,
) {
  return String(row)
    .replaceAll(
      "FAIL",
      v.a.rgb(
        251,
        113,
        133,
        "FAIL",
      ),
    )
    .replaceAll(
      "PASS",
      v.a.rgb(
        134,
        239,
        172,
        "PASS",
      ),
    )
    .replaceAll(
      "PROMOTE",
      v.a.rgb(
        134,
        239,
        172,
        "PROMOTE",
      ),
    )
    .replaceAll(
      "READY TO PROMOTE",
      v.a.bold(
        v.a.rgb(
          134,
          239,
          172,
          "READY TO PROMOTE",
        ),
      ),
    );
}

function compactDiff(
  evaluation,
  v,
) {
  const before = new Map(
    evaluation.baseline.checks.map(
      (c) => [
        c.id ??
          `${c.kind}:${c.target}`,
        c,
      ],
    ),
  );
  const after = new Map(
    evaluation.candidate.checks.map(
      (c) => [
        c.id ??
          `${c.kind}:${c.target}`,
        c,
      ],
    ),
  );

  const ids = [
    ...new Set([
      ...before.keys(),
      ...after.keys(),
    ]),
  ];

  const labels = ids.map(
    (id) =>
      (after.get(id) ?? before.get(id))
        ?.label ?? id,
  );

  const width = Math.min(
    30,
    Math.max(
      12,
      ...labels.map((x) => x.length),
    ),
  );

  return ids.map((id) => {
    const a = before.get(id);
    const b = after.get(id);
    const label = truncate(
      (b ?? a)?.label ?? id,
      width,
    ).padEnd(width);

    return `${label} ${mark(
      a?.passed,
      v,
    )}  ${v.a.dim("→")}  ${mark(
      b?.passed,
      v,
    )}`;
  });
}

function compactWork(
  before,
  after,
  v,
) {
  const rows = [];

  add(
    "Tokens",
    before.tokenCount,
    after.tokenCount,
    (x) =>
      x >= 1000
        ? `${(x / 1000).toFixed(1)}k`
        : String(Math.round(x)),
  );

  add(
    "Tool calls",
    before.toolUseCount,
    after.toolUseCount,
    (x) => String(Math.round(x)),
  );

  add(
    "Time",
    before.durationMs,
    after.durationMs,
    (x) =>
      x >= 1000
        ? `${(x / 1000).toFixed(1)}s`
        : `${Math.round(x)}ms`,
  );

  return rows;

  function add(
    label,
    b,
    a,
    format,
  ) {
    if (
      b === null ||
      b === undefined ||
      a === null ||
      a === undefined ||
      !Number.isFinite(Number(b)) ||
      !Number.isFinite(Number(a))
    ) {
      return;
    }

    const beforeValue = Number(b);
    const afterValue = Number(a);
    const delta =
      beforeValue === 0
        ? "—"
        : `${Math.round(
            ((afterValue - beforeValue) /
              beforeValue) *
              100,
          )}%`;

    rows.push(
      `${label.padEnd(11)} ${format(
        beforeValue,
      ).padStart(7)}  ${v.a.dim(
        "→",
      )}  ${format(
        afterValue,
      ).padStart(7)}  ${v.a.dim(
        delta,
      )}`,
    );
  }
}

function mark(passed, v) {
  return passed
    ? v.badge("PASS", "success")
    : v.badge("FAIL", "danger");
}

function verdictBadge(
  verdict,
  v,
) {
  if (verdict === "promote") {
    return v.badge(
      "SAFE TO PROMOTE",
      "success",
    );
  }
  if (verdict === "reject") {
    return v.badge(
      "DO NOT PROMOTE",
      "danger",
    );
  }
  return v.badge(
    String(
      verdict ?? "UNKNOWN",
    ),
    "warning",
  );
}

function actionLines(model, v) {
  const primary = [];

  if (!model.spec) {
    primary.push(
      `${v.key("S")} Create spec`,
    );
  } else if (model.spec.draft) {
    primary.push(
      `${v.key("E")} Review spec`,
    );
  } else {
    primary.push(
      `${v.key("T")} Test`,
    );
  }

  if (
    model.verification?.verdict ===
      "promote" &&
    !(
      model.verification?.coverage
        ?.missingTargets?.length
    )
  ) {
    primary.push(
      `${v.key("P")} ${v.a.bold(
        v.a.rgb(
          134,
          239,
          172,
          "Promote",
        ),
      )}`,
    );
  }

  const secondary = [];

  if (
    ![
      "active",
      "rejected",
      "retired",
    ].includes(model.patch.status)
  ) {
    secondary.push(
      `${v.key("R")} Reject`,
    );
  }

  secondary.push(
    `${v.key("D")} Details`,
  );
  secondary.push(
    `${v.key("Q")} Quit`,
  );

  return [
    "",
    `  ${primary.join("    ")}`,
    `  ${secondary.join("    ")}`,
    "",
  ];
}

export function renderProgress({
  patchId,
  agent,
  baseline = "waiting",
  candidate = "waiting",
  plain = false,
  frame = 0,
}) {
  const v = ui({ plain });

  const row = (
    label,
    status,
  ) => {
    const tone =
      status === "done"
        ? "success"
        : status === "running"
          ? "info"
          : "muted";

    const state =
      status === "done"
        ? "done"
        : status === "running"
          ? "running"
          : "waiting";

    return `  ${v.statusDot(
      tone,
    )} ${label.padEnd(11)} ${v.a.dim(
      state.padEnd(8),
    )} ${v.progress(
      status,
      14,
      frame,
    )}`;
  };

  return [
    v.header(
      "Real Behavior Diff",
      `via ${agent}`,
    ),
    "",
    v.panel(
      "ISOLATED A/B",
      [
        "",
        `  ${v.a.dim(
          patchId,
        )}`,
        "",
        row(
          "baseline",
          baseline,
        ),
        row(
          "candidate",
          candidate,
        ),
        "",
      ],
      {
        tone:
          candidate === "running"
            ? "info"
            : candidate === "done"
              ? "success"
              : "neutral",
        right: "no auto-promote",
      },
    ),
    "",
    `  ${v.a.dim(
      "The user's working tree is not used.  ·  isolated workspace  ·  human promotion gate",
    )}`,
  ].join("\n");
}

export function renderPromotionSuccess({
  patch,
  artifacts,
  plain = false,
}) {
  const v = ui({ plain });

  return [
    v.header(
      "Behavior promotion",
      v.badge("ACTIVE", "success"),
    ),
    "",
    v.panel(
      "PROMOTED",
      [
        "",
        `  ${v.a.bold(
          v.a.rgb(
            134,
            239,
            172,
            "◆ Behavior promoted",
          ),
        )}`,
        `  ${v.a.dim(
          "Behavior is now active.",
        )}`,
        "",
        `  ${v.a.dim(
          patch.id,
        )}`,
        "",
        `  ${v.a.dim(
          "compiled targets",
        )}`,
        ...artifacts.map(
          (artifact) =>
            `  ${v.statusDot(
              "success",
            )} ${String(
              artifact.adapter,
            ).padEnd(12)} ${artifact.path}`,
        ),
        "",
      ],
      {
        tone: "success",
        right: "reversible",
      },
    ),
    "",
    v.panel(
      "ROLLBACK",
      [
        "",
        `  ${v.command(
          `behavectl rollback ${patch.id}`,
        )}`,
        "",
      ],
      {
        tone: "violet",
        right: "one command",
      },
    ),
  ].join("\n");
}

export function renderRejected(
  patch,
  { plain = false } = {},
) {
  const v = ui({ plain });

  return [
    v.header(
      "Behavior review",
      v.badge("REJECTED", "muted"),
    ),
    "",
    v.panel(
      "NOT SHIPPED",
      [
        "",
        `  ${v.a.bold(
          "× Behavior rejected",
        )}`,
        `  ${v.a.dim(
          patch.id,
        )}`,
        "",
        `  ${v.a.dim(
          "Future agent behavior was not changed.",
        )}`,
        "",
      ],
      {
        tone: "muted",
        right: "safe",
      },
    ),
  ].join("\n");
}

function displayAgent(id) {
  if (id === "claude-code") return "Claude Code";
  if (id === "codex") return "Codex";
  if (id === "codebuddy") return "CodeBuddy Code";
  return id;
}

function clearAndDraw(text) {
  process.stdout.write("\x1b[2J\x1b[H\x1b[?25l");
  process.stdout.write(text);
  process.stdout.write("\n");
}

export async function reviewPatch(store, patch, actions, runtime = {}) {
  let model = await buildReviewModel(store, patch);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {
      interactive: false,
      output: renderReview(model, { plain: true }),
    };
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  readline.emitKeypressEvents(process.stdin, rl);
  process.stdin.setRawMode(true);

  let busy = false;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    rl.close();
    process.stdout.write("\x1b[?25h");
  };

  const draw = () => {
    clearAndDraw(renderReview(model));
    if (runtime.notice) {
      process.stdout.write(`\n${ui().a.brightYellow(runtime.notice)}\n`);
    }
  };

  const refresh = async () => {
    const current = await store.patch(model.patch.id);
    model = await buildReviewModel(store, current ?? model.patch);
  };

  draw();

  return new Promise((resolve, reject) => {
    const finish = (value) => {
      process.stdin.off("keypress", handler);
      cleanup();
      resolve(value);
    };

    const fail = (error) => {
      process.stdin.off("keypress", handler);
      cleanup();
      reject(error);
    };

    const handler = async (_str, key) => {
      if (busy) return;

      try {
        const name = String(key?.name ?? "").toLowerCase();

        if (name === "q" || (key?.ctrl && name === "c")) {
          finish({ interactive: true });
          return;
        }

        if (name === "s" && !model.spec) {
          busy = true;
          await writeSuggestedSpec(store, patch);
          await refresh();
          busy = false;
          draw();
          return;
        }

        if (name === "e" && model.spec?.draft) {
          finish({
            interactive: true,
            handoff: "edit-spec",
            specPath: model.specPath,
          });
          return;
        }

        if (
          name === "t" &&
          model.spec &&
          !model.spec.draft &&
          actions?.test
        ) {
          busy = true;

          let currentAgent =
            runtime.agent ?? "agent";
          let progress = {
            baseline: "waiting",
            candidate: "waiting",
          };
          let frame = 0;

          const drawProgress = () => {
            clearAndDraw(
              renderProgress({
                patchId:
                  model.patch.id,
                agent:
                  displayAgent(
                    currentAgent,
                  ),
                ...progress,
                frame,
              }),
            );
          };

          const ticker = setInterval(
            () => {
              frame += 1;

              if (
                progress.baseline ===
                  "running" ||
                progress.candidate ===
                  "running"
              ) {
                drawProgress();
              }
            },
            90,
          );

          const onProgress = async (event) => {
            if (
              event.agent &&
              event.agent !== currentAgent &&
              event.phase === "agent"
            ) {
              currentAgent = event.agent;
              progress = {
                baseline: "waiting",
                candidate: "waiting",
              };
            } else if (event.agent) {
              currentAgent = event.agent;
            }

            if (event.phase === "baseline") {
              progress.baseline =
                event.state === "running" ? "running" : "done";
            }
            if (event.phase === "candidate") {
              progress.candidate =
                event.state === "running" ? "running" : "done";
            }

            if (
              [
                "baseline",
                "candidate",
              ].includes(event.phase)
            ) {
              drawProgress();
            }
          };

          try {
            await actions.test(
              model,
              { onProgress },
            );
          } finally {
            clearInterval(ticker);
          }

          await refresh();
          busy = false;
          draw();
          return;
        }

        if (
          name === "p" &&
          model.verification?.verdict === "promote" &&
          !(model.verification?.coverage?.missingTargets?.length) &&
          actions?.promote
        ) {
          busy = true;
          const promoted = await actions.promote(model);
          clearAndDraw(
            renderPromotionSuccess({
              patch: promoted.patch,
              artifacts: promoted.artifacts,
            }),
          );
          process.stdout.write("\nPress any key to close…");
          process.stdin.once("keypress", () => finish({
            interactive: true,
            handoff: "promote",
          }));
          return;
        }

        if (
          name === "r" &&
          !["active", "rejected", "retired"].includes(model.patch.status) &&
          actions?.reject
        ) {
          busy = true;
          const rejected = await actions.reject(model);
          clearAndDraw(renderRejected(rejected));
          process.stdout.write("\nPress any key to close…");
          process.stdin.once("keypress", () => finish({
            interactive: true,
            handoff: "reject",
          }));
          return;
        }

        if (name === "d") {
          busy = true;
          clearAndDraw(JSON.stringify(model.patch, null, 2));
          process.stdout.write("\nPress any key to return…");
          process.stdin.once("keypress", async () => {
            busy = false;
            draw();
          });
        }
      } catch (error) {
        fail(error);
      }
    };

    process.stdin.on("keypress", handler);
  });
}

export async function renderInbox(store) {
  const patches = await store.patches();
  const pending = patches
    .filter((p) =>
      [
        "candidate",
        "tested",
      ].includes(p.status),
    )
    .sort((a, b) =>
      String(b.createdAt).localeCompare(
        String(a.createdAt),
      ),
    );

  const v = ui();

  if (!pending.length) {
    return [
      v.header(
        "Behavior inbox",
        v.badge("CLEAR", "success"),
      ),
      "",
      v.panel(
        "INBOX",
        [
          "",
          `  ${v.statusDot(
            "success",
          )} ${v.a.bold(
            "No behavior changes waiting for review.",
          )}`,
          "",
        ],
        {
          tone: "success",
          right: "0 pending",
        },
      ),
    ].join("\n");
  }

  const rows = [];

  for (
    let i = 0;
    i < pending.length;
    i++
  ) {
    const patch = pending[i];
    const tone =
      patch.status === "tested"
        ? "info"
        : "warning";

    rows.push(
      `  ${String(
        i + 1,
      ).padStart(2, "0")}  ${v.badge(
        patch.status,
        tone,
      )}  ${v.a.dim(
        patch.id,
      )}`,
    );
    rows.push(
      `      ${truncate(
        patch.behavior.statement,
        v.width - 10,
      )}`,
    );

    if (i < pending.length - 1) {
      rows.push(
        `      ${v.a.gray(
          "·".repeat(
            Math.min(
              36,
              v.width - 12,
            ),
          ),
        )}`,
      );
    }
  }

  return [
    v.header(
      "Behavior inbox",
      v.badge(
        `${pending.length} PENDING`,
        "warning",
      ),
    ),
    "",
    v.panel(
      "REVIEW QUEUE",
      [
        "",
        `  ${pending.length} behavior change${
          pending.length === 1 ? "" : "s"
        } waiting for review`,
        "",
        ...rows,
        "",
      ],
      {
        tone: "warning",
        right: "human gate",
      },
    ),
    "",
    `  ${v.command(
      "behavectl review <id>",
    )}  ${v.a.dim(
      "inspect a change",
    )}`,
  ].join("\n");
}
