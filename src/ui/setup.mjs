import { ui } from "./theme.mjs";

export function renderInitSurface({
  repo,
  bridgePath,
  agents,
  codexTrustNote = false,
  plain = false,
}) {
  const v = ui({ plain });

  const agentLines = agents.length
    ? agents.map((agent) => {
        const tone =
          agent.connected
            ? "success"
            : "muted";

        return `  ${v.statusDot(
          tone,
        )} ${v.a.bold(
          agent.name.padEnd(12),
        )} ${v.a.dim(
          agent.detail,
        )}`;
      })
    : [
        `  ${v.statusDot(
          "warning",
        )} ${v.a.bold(
          "No coding agent detected",
        )}`,
        "",
        `  ${v.command(
          "behavectl init --claude",
        )}`,
        `  ${v.command(
          "behavectl init --codex",
        )}`,
      ];

  if (codexTrustNote) {
    agentLines.push("");
    agentLines.push(
      `  ${v.a.dim(
        "Codex project hooks may require trust review in /hooks.",
      )}`,
    );
  }

  return [
    v.header(
      "Behavior change control",
      `${repo}  ${v.badge(
        "INITIALIZED",
        "success",
      )}`,
    ),
    "",
    v.panel(
      "LOCAL CONTROL",
      [
        "",
        `  ${v.statusDot(
          "success",
        )} ${v.a.bold(
          ".behavectl/",
        )}  ${v.a.dim(
          "local behavior history",
        )}`,
        `  ${v.statusDot(
          "success",
        )} ${v.a.bold(
          bridgePath,
        )}  ${v.a.dim(
          "dependency-free hook bridge",
        )}`,
        "",
      ],
      {
        tone: "success",
        right: "local-first",
      },
    ),
    "",
    v.panel(
      "AGENTS",
      [
        "",
        ...agentLines,
        "",
      ],
      {
        tone:
          agents.length
            ? "info"
            : "warning",
        right:
          agents.length
            ? `${agents.length} connected`
            : "manual connect",
      },
    ),
    "",
    v.panel(
      "NEXT",
      [
        "",
        `  ${v.a.bold(
          "Keep working normally.",
        )}`,
        `  ${v.command(
          "behavectl inbox",
        )}`,
        "",
      ],
      {
        tone: "violet",
        right: "zero workflow change",
      },
    ),
  ].join("\n");
}

export function renderDoctorSurface(
  report,
  { plain = false } = {},
) {
  const v = ui({ plain });

  const runtime = [
    ["Node", report.node],
    ["Git", report.git],
  ].map(([name, value]) =>
    `  ${v.statusDot(value.installed ? "success" : "muted")} ${v.a.bold(name.padEnd(14))} ${v.a.dim(value.installed ? value.version : "not found")}`,
  );

  const legacyAgents = [
    { id: "claude-code", displayName: "Claude Code", ...(report.claude ?? {}) },
    { id: "codex", displayName: "Codex", ...(report.codex ?? {}) },
  ];
  const agents = report.agents?.length ? report.agents : legacyAgents;
  const evaluator = agents.map((agent) => {
    const ready = report.ready?.[agent.id] ?? (
      agent.id === "claude-code"
        ? report.realBehaviorDiffReady?.claude
        : report.realBehaviorDiffReady?.[agent.id]
    );
    const tone = ready ? "success" : agent.installed ? "warning" : "muted";
    const state = ready
      ? "detected · auth not checked"
      : agent.installed
        ? "installed · auth checked on run"
        : "not detected";
    const maturity = agent.maturity ? ` · ${agent.maturity}` : "";
    return `  ${v.statusDot(tone)} ${v.a.bold(String(agent.displayName ?? agent.id).padEnd(16))} ${v.a.dim(state + maturity)}`;
  });

  const ready = agents.some((agent) => report.ready?.[agent.id] ?? agent.installed);

  return [
    v.header(
      "System doctor",
      v.badge(ready ? "DETECTED" : "ACTION NEEDED", ready ? "success" : "warning"),
    ),
    "",
    v.panel("RUNTIME", ["", ...runtime, ""], { tone: "neutral" }),
    "",
    v.panel(
      "AGENT REGISTRY",
      [
        "",
        ...evaluator,
        "",
        `  ${v.a.dim("Only declared Behavior Patch targets are required.")}`,
        "",
      ],
      {
        tone: ready ? "success" : "warning",
        right: "pluggable adapters",
      },
    ),
  ].join("\n");
}

export function renderUninstallSurface({
  claudeChanged,
  codexChanged,
  plain = false,
}) {
  const v = ui({ plain });

  return [
    v.header(
      "Uninstall",
      v.badge("REVERSIBLE", "violet"),
    ),
    "",
    v.panel(
      "HOOKS",
      [
        "",
        `  ${v.statusDot(
          claudeChanged
            ? "success"
            : "muted",
        )} ${v.a.bold(
          "Claude Code",
        )}  ${v.a.dim(
          claudeChanged
            ? "Behavectl hooks removed"
            : "no Behavectl hook to remove",
        )}`,
        `  ${v.statusDot(
          codexChanged
            ? "success"
            : "muted",
        )} ${v.a.bold(
          "Codex",
        )}        ${v.a.dim(
          codexChanged
            ? "Behavectl hooks removed"
            : "no Behavectl hook to remove",
        )}`,
        "",
      ],
      {
        tone: "success",
        right: "surgical uninstall",
      },
    ),
    "",
    v.panel(
      "LOCAL HISTORY",
      [
        "",
        `  ${v.a.bold(
          ".behavectl/",
        )} ${v.a.dim(
          "was preserved",
        )}`,
        `  ${v.a.dim(
          "Delete it manually only if you also want to erase local history.",
        )}`,
        "",
      ],
      {
        tone: "neutral",
        right: "preserved",
      },
    ),
  ].join("\n");
}

export function renderHelpSurface({
  version,
  plain = false,
}) {
  const v = ui({ plain });

  const commands = [
    ["behavectl", "context-aware home"],
    ["behavectl studio", "local visual workbench"],
    ["behavectl demo", "30-second product tour"],
    ["behavectl init", "connect coding agents"],
    ["behavectl agent install", "install Skill / MCP access inside agents"],
    ["behavectl inbox", "review queue"],
    ["behavectl review [id]", "inspect / test / promote"],
    ["behavectl log", "behavior history"],
    ["behavectl doctor", "agent readiness"],
  ];

  const trust = [
    ["behavectl verify <id>", "cross-agent stability"],
    ["behavectl proof <id>", "export Behavior Proof"],
    ["behavectl proof verify <dir>", "integrity + binding"],
    ["behavectl ci init", "install Behavior CI"],
    ["behavectl rollback <id>", "retire behavior"],
  ];

  const maintainer = [
    ["behavectl rc --agent codex --artifact <tgz>", "Codex evidence shard"],
    ["behavectl rc --agent claude-code --artifact <tgz>", "Claude evidence shard"],
    ["behavectl rc merge <a> <b> --out <dir>", "cross-machine Release Candidate"],
    ["behavectl replay bundle <dir>", "offline protocol replay"],
  ];

  return [
    v.header(
      "Git for AI behavior.",
      `v${version}`,
    ),
    "",
    v.panel(
      "START HERE",
      commandRows(
        v,
        commands,
      ),
      {
        tone: "info",
        right: "everyday",
      },
    ),
    "",
    v.panel(
      "TRUST & CHANGE CONTROL",
      commandRows(
        v,
        trust,
      ),
      {
        tone: "violet",
      },
    ),
    "",
    v.panel(
      "RELEASE ENGINEERING",
      commandRows(
        v,
        maintainer,
      ),
      {
        tone: "warning",
        right: "maintainers",
      },
    ),
    "",
    `  ${v.a.dim(
      "Run `behavectl help --all` for the full command reference.",
    )}`,
  ].join("\n");
}

function commandRows(v, rows) {
  return [
    "",
    ...rows.map(
      ([command, detail]) =>
        `  ${v.a.rgb(
          103,
          232,
          249,
          command.padEnd(31),
        )} ${v.a.dim(
          detail,
        )}`,
    ),
    "",
  ];
}

function agentReadiness(
  v,
  name,
  ready,
) {
  return `  ${v.statusDot(
    ready
      ? "success"
      : "muted",
  )} ${v.a.bold(
    name.padEnd(12),
  )} ${v.a.dim(
    ready
      ? "available · auth checked on first run"
      : "binary not found",
  )}`;
}
