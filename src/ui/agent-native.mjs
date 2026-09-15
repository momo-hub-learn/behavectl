import path from "node:path";
import { ui } from "./theme.mjs";

export function renderAgentNativeInstall(
  result,
  {
    uninstall = false,
    plain = false,
  } = {},
) {
  const v = ui({ plain });

  const rows = result.results.map(
    (item) => {
      const tone =
        item.changed
          ? "success"
          : "muted";

      return `  ${v.statusDot(
        tone,
      )} ${v.a.bold(
        item.label.padEnd(24),
      )} ${v.a.dim(
        relative(
          result.repoRoot,
          item.path,
        ),
      )}`;
    },
  );

  return [
    v.header(
      "Agent-native mode",
      v.badge(
        uninstall
          ? "REMOVED"
          : "CONNECTED",
        uninstall
          ? "muted"
          : "success",
      ),
    ),
    "",
    v.panel(
      uninstall
        ? "INTEGRATIONS REMOVED"
        : "DIRECT AGENT ACCESS",
      [
        "",
        ...rows,
        "",
      ],
      {
        tone:
          uninstall
            ? "muted"
            : "violet",
        right:
          uninstall
            ? "history preserved"
            : "repo scoped",
      },
    ),
    ...(
      uninstall
        ? []
        : [
            "",
            v.panel(
              "USE IT INSIDE YOUR AGENT",
              [
                "",
                `  ${v.a.bold(
                  "Claude Code",
                )}  ${v.a.rgb(
                  103,
                  232,
                  249,
                  "/behavectl",
                )}`,
                `  ${v.a.bold(
                  "Codex",
                )}        ${v.a.rgb(
                  167,
                  139,
                  250,
                  "$behavectl",
                )}`,
                "",
                `  ${v.a.dim(
                  'Or just ask: "What behavior changes are waiting for review?"',
                )}`,
                "",
              ],
              {
                tone: "info",
                right: "natural language",
              },
            ),
          ]
    ),
  ].join("\n");
}

export function renderAgentNativeStatus(
  status,
  {
    plain = false,
  } = {},
) {
  const v = ui({ plain });

  const rows = [
    [
      "Claude Code skill",
      status.claudeSkill,
      status.claudeSkillPath,
    ],
    [
      "Codex / Agent Skills",
      status.codexSkill,
      status.codexSkillPath,
    ],
    [
      "Claude Code MCP",
      status.claudeProjectMcp,
      status.claudeProjectMcpPath,
    ],
  ];

  const connected =
    rows.filter(
      ([, ready]) => ready,
    ).length;

  return [
    v.header(
      "Agent-native integration",
      v.badge(
        `${connected}/3 CONNECTED`,
        connected
          ? "success"
          : "warning",
      ),
    ),
    "",
    v.panel(
      "SURFACES",
      [
        "",
        ...rows.map(
          ([label, ready, file]) =>
            `  ${v.statusDot(
              ready
                ? "success"
                : "muted",
            )} ${v.a.bold(
              label.padEnd(22),
            )} ${v.a.dim(
              relative(
                status.repoRoot,
                file,
              ),
            )}`,
        ),
        "",
      ],
      {
        tone:
          connected
            ? "info"
            : "warning",
        right: "skills + MCP",
      },
    ),
    "",
    v.panel(
      "SAFETY MODEL",
      [
        "",
        `  ${v.statusDot(
          "success",
        )} MCP tools are read-only`,
        `  ${v.statusDot(
          "success",
        )} Promote / rollback remain human-gated`,
        `  ${v.statusDot(
          "success",
        )} Real verification is never auto-triggered by MCP`,
        "",
      ],
      {
        tone: "success",
        right: "agent-native ≠ agent-controlled",
      },
    ),
  ].join("\n");
}

function relative(root, file) {
  return path.relative(
    root,
    file,
  ) || ".";
}
