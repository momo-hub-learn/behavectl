import { ui } from "./theme.mjs";

const catalog = {
  BCTL_EVAL_RUNNER_FAILED: {
    title: "Agent run failed",
    tone: "danger",
    safety:
      "Persistent behavior was NOT changed.",
    explanation:
      "The coding-agent run failed before Behavectl could make a trustworthy behavior verdict.",
    actions: [
      "behavectl doctor",
      "Check agent authentication / network, then retry.",
    ],
  },

  BCTL_PROTOCOL_PARSE_FAILED: {
    title: "Agent protocol changed",
    tone: "danger",
    safety:
      "No behavior verdict was produced.",
    explanation:
      "The agent exited, but its structured event stream did not match the protocol Behavectl expects.",
    actions: [
      "behavectl replay <agent> <trace.jsonl>",
      "Upgrade Behavectl or inspect the retained protocol trace.",
    ],
  },

  BCTL_PROTOCOL_DRIFT: {
    title: "Protocol replay blocked the run",
    tone: "danger",
    safety:
      "This run is NOT valid release evidence.",
    explanation:
      "Captured agent traces no longer replay cleanly with the current parser.",
    actions: [
      "Inspect traces/protocol-report.json",
      "behavectl replay bundle <live-bundle>",
    ],
  },

  BCTL_TRACE_INTEGRITY_FAILED: {
    title: "Trace integrity failed",
    tone: "danger",
    safety:
      "Do not trust this validation bundle.",
    explanation:
      "At least one retained raw protocol trace no longer matches its recorded digest.",
    actions: [
      "Use a fresh live validation bundle.",
      "Do not regenerate checksums to hide the mismatch.",
    ],
  },

  BCTL_PROOF_UNBOUND_VERIFICATION: {
    title: "Proof needs fresh verification",
    tone: "warning",
    safety:
      "Nothing was promoted.",
    explanation:
      "The stored verification predates patch-bound proof semantics.",
    actions: [
      "behavectl verify <patch-id>",
      "Then create the proof again.",
    ],
  },

  BCTL_PROOF_STALE_VERIFICATION: {
    title: "Proof is stale",
    tone: "warning",
    safety:
      "The changed patch cannot reuse old evidence.",
    explanation:
      "The Behavior Patch changed after its latest verification.",
    actions: [
      "behavectl verify <patch-id>",
      "Create a new proof only after verification passes.",
    ],
  },

  BCTL_PROOF_UNBOUND_EVALUATION: {
    title: "Evaluation is not patch-bound",
    tone: "warning",
    safety:
      "Old evaluation data cannot unlock promotion.",
    explanation:
      "A stored evaluation does not contain the exact Behavior Patch fingerprint.",
    actions: [
      "behavectl verify <patch-id>",
    ],
  },

  BCTL_PROOF_STALE_EVALUATION: {
    title: "Evaluation no longer matches the patch",
    tone: "warning",
    safety:
      "Old evaluation data cannot unlock promotion.",
    explanation:
      "The retained evaluation belongs to a different version of the Behavior Patch.",
    actions: [
      "behavectl verify <patch-id>",
    ],
  },

  BCTL_RC_PREFLIGHT_FAILED: {
    title: "Release evidence run blocked",
    tone: "warning",
    safety:
      "No release evidence run was started.",
    explanation:
      "Only the coding agent requested for this run must be available. Claude Code and Codex may produce independent RC shards on different machines.",
    actions: [
      "behavectl doctor",
      "Run `behavectl rc --agent codex ...` or `--agent claude-code ...` on the matching machine.",
      "Merge the two valid shards with `behavectl rc merge`.",
    ],
  },

  BCTL_LIVE_PREFLIGHT_FAILED: {
    title: "Live validation blocked",
    tone: "warning",
    safety:
      "No model sessions were launched.",
    explanation:
      "The required real-agent environment is not ready.",
    actions: [
      "behavectl doctor",
      "Fix the missing agent runtime, then retry.",
    ],
  },

  BCTL_LIVE_PROOF_INTEGRITY_FAILED: {
    title: "Live proof integrity failed",
    tone: "danger",
    safety:
      "This bundle cannot be used as release evidence.",
    explanation:
      "The generated Behavior Proof did not pass integrity verification.",
    actions: [
      "Keep the failure bundle for diagnosis.",
      "Run a fresh release validation after fixing the cause.",
    ],
  },
};

export function renderCliError(
  error,
  {
    plain = false,
    context = null,
  } = {},
) {
  const v = ui({ plain });
  const entry =
    catalog[error?.code] ??
    classifyByMessage(error);

  const reference =
    entry.reference ??
    publicReference(
      error?.code,
    );

  const messageLines = wrapText(
    error?.message ??
      "Unexpected Behavectl error.",
    Math.max(
      24,
      v.width - 8,
    ),
  );

  const details = [
    "",
    ...messageLines.map(
      (line) =>
        `  ${v.a.bold(line)}`,
    ),
    "",
  ];

  if (entry.explanation) {
    details.push(
      ...wrapText(
        entry.explanation,
        Math.max(
          24,
          v.width - 8,
        ),
      ).map(
        (line) =>
          `  ${v.a.dim(line)}`,
      ),
      "",
    );
  }

  const output = [
    v.header(
      context ??
        "Operation stopped safely",
      v.badge(
        "BLOCKED",
        entry.tone,
      ),
    ),
    "",
    v.panel(
      entry.title.toUpperCase(),
      details,
      {
        tone: entry.tone,
        right: reference,
      },
    ),
  ];

  if (entry.safety) {
    output.push(
      "",
      v.panel(
        "SAFETY",
        [
          "",
          `  ${v.statusDot(
            "success",
          )} ${v.a.bold(
            entry.safety,
          )}`,
          "",
        ],
        {
          tone: "success",
          right: "trust boundary",
        },
      ),
    );
  }

  const actions = [
    ...(entry.actions ?? []),
  ];

  if (error?.liveBundle) {
    actions.unshift(
      `Failure bundle preserved: ${error.liveBundle}`,
    );
  }

  if (actions.length) {
    output.push(
      "",
      v.panel(
        "RECOVER",
        [
          "",
          ...actions.flatMap(
            (action) => {
              if (
                action.startsWith(
                  "behavectl ",
                )
              ) {
                return [
                  `  ${v.command(
                    action,
                  )}`,
                ];
              }

              const wrapped =
                wrapText(
                  action,
                  Math.max(
                    20,
                    v.width - 12,
                  ),
                );

              return wrapped.map(
                (line, index) =>
                  index === 0
                    ? `  ${v.statusDot(
                        "info",
                      )} ${line}`
                    : `    ${line}`,
              );
            },
          ),
          "",
        ],
        {
          tone: "violet",
          right: "next action",
        },
      ),
    );
  }

  output.push(
    "",
    `  ${v.a.dim(
      "No stack trace by default. Set BEHAVECTL_DEBUG=1 for diagnostic details.",
    )}`,
  );

  if (
    process.env
      .BEHAVECTL_DEBUG === "1" &&
    error?.stack
  ) {
    output.push(
      "",
      v.panel(
        "DEBUG",
        String(
          error.stack,
        )
          .split("\n")
          .slice(0, 12)
          .map(
            (line) =>
              `  ${v.a.dim(line)}`,
          ),
        {
          tone: "muted",
          right: "BEHAVECTL_DEBUG=1",
        },
      ),
    );
  }

  return output.join("\n");
}

export function errorDescriptor(error) {
  const entry =
    catalog[error?.code] ??
    classifyByMessage(error);

  return {
    code:
      error?.code ?? null,
    reference:
      entry.reference ??
      publicReference(
        error?.code,
      ),
    ...entry,
  };
}

function classifyByMessage(error) {
  const message =
    String(
      error?.message ?? "",
    );

  if (
    /Patch not found:/i.test(
      message,
    )
  ) {
    return {
      reference: "ERR-PATCH-NOT-FOUND",
      title:
        "Behavior Patch not found",
      tone: "warning",
      safety:
        "No persistent behavior was changed.",
      explanation:
        "The requested patch id does not exist in this repository.",
      actions: [
        "behavectl inbox",
        "behavectl patches",
      ],
    };
  }

  if (
    /changed after .*verification/i.test(
      message,
    )
  ) {
    return {
      reference: "ERR-VERIFICATION-STALE",
      title:
        "Verification is stale",
      tone: "warning",
      safety:
        "The changed behavior cannot be promoted with old evidence.",
      explanation:
        "Behavectl detected that the Behavior Patch no longer matches its retained verification.",
      actions: [
        "behavectl verify <patch-id>",
      ],
    };
  }

  if (
    /missing targets|not eligible for promotion|no real Verification Run/i.test(
      message,
    )
  ) {
    return {
      reference: "ERR-PROMOTION-BLOCKED",
      title:
        "Promotion gate blocked",
      tone: "warning",
      safety:
        "Persistent behavior was NOT changed.",
      explanation:
        "The Behavior Patch has not satisfied the full real-agent verification policy.",
      actions: [
        "behavectl verify <patch-id> --require-all --repeat 3",
      ],
    };
  }

  const unknownCommand =
    message.match(
      /^Unknown command:\s*([^\s]+)$/i,
    );

  if (unknownCommand) {
    const typed =
      unknownCommand[1];
    const suggestion =
      nearestCommand(typed);

    return {
      reference: "ERR-COMMAND-NOT-FOUND",
      title:
        "Command not found",
      tone: "warning",
      safety:
        "No project behavior was changed.",
      explanation: suggestion
        ? `Behavectl does not have \`${typed}\`. The closest command is \`${suggestion}\`.`
        : `Behavectl does not have \`${typed}\`.`,
      actions: [
        ...(suggestion
          ? [`behavectl ${suggestion}`]
          : []),
        "behavectl help",
      ],
    };
  }

  if (
    /^Usage:/i.test(message) ||
    /must be an integer|is required/i.test(
      message,
    )
  ) {
    return {
      reference: "ERR-USAGE",
      title:
        "Command needs attention",
      tone: "warning",
      safety:
        "No project behavior was changed.",
      explanation: null,
      actions: [
        "behavectl help",
      ],
    };
  }

  return {
    reference: "ERR-UNEXPECTED",
    title:
      "Unexpected failure",
    tone: "danger",
    safety:
      "Behavectl stopped instead of guessing.",
    explanation:
      "The operation did not complete. Inspect the suggested recovery path before retrying.",
    actions: [
      "behavectl doctor",
    ],
  };
}


const publicCommands = [
  "agent",
  "ci",
  "demo",
  "diff",
  "doctor",
  "help",
  "inbox",
  "init",
  "live",
  "log",
  "patches",
  "promote",
  "proof",
  "rc",
  "replay",
  "review",
  "rollback",
  "show",
  "spec",
  "test",
  "verify",
];

function nearestCommand(value) {
  const input = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!input) return null;

  let best = null;
  let bestDistance = Infinity;

  for (const command of publicCommands) {
    const distance = editDistance(
      input,
      command,
    );

    if (distance < bestDistance) {
      best = command;
      bestDistance = distance;
    }
  }

  const budget =
    input.length <= 4 ? 1 : 2;

  return bestDistance <= budget
    ? best
    : null;
}

function editDistance(a, b) {
  const prev =
    Array.from(
      { length: b.length + 1 },
      (_, i) => i,
    );

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const above = prev[j];
      const cost =
        a[i - 1] === b[j - 1]
          ? 0
          : 1;

      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diagonal + cost,
      );
      diagonal = above;
    }
  }

  return prev[b.length];
}

function wrapText(
  value,
  width,
) {
  const words = String(
    value ?? "",
  )
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (!words.length) {
    return [""];
  }

  const lines = [];
  let line = "";

  for (const word of words) {
    if (!line) {
      line = word;
      continue;
    }

    if (
      line.length +
        1 +
        word.length <=
      width
    ) {
      line += ` ${word}`;
      continue;
    }

    lines.push(line);
    line = word;
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}


function publicReference(code) {
  if (!code) {
    return "ERR-UNEXPECTED";
  }

  const clean = String(code)
    .replace(/^BCTL_/, "")
    .replace(/[^A-Z0-9]+/g, "-");

  return `ERR-${clean}`;
}
