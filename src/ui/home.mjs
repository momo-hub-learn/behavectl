import fs from "node:fs/promises";
import path from "node:path";
import { ui } from "./theme.mjs";

export async function buildHomeModel({ store, repoRoot, health }) {
  const initialized = await exists(store.root);

  if (!initialized) {
    const model = {
      repo: path.basename(repoRoot),
      repoRoot,
      initialized: false,
      events: {
        total: 0,
        unprocessed: 0,
      },
      patches: {
        total: 0,
        candidates: 0,
        tested: 0,
        active: 0,
        rejected: 0,
        retired: 0,
      },
      agents: buildAgentModel(health),
    };

    model.next = {
      title: "Initialize behavior change control for this project.",
      command: "behavectl init",
      note: "Read-only until you explicitly initialize.",
    };

    return model;
  }

  const events = await store.events();
  const patches = await store.patches();
  const state = await store.state();

  const processed = new Set(state.processedEventIds ?? []);
  const unprocessedEvents = events.filter((event) => !processed.has(event.id));

  const candidates = patches.filter((patch) => patch.status === "candidate");
  const tested = patches.filter((patch) => patch.status === "tested");
  const active = patches.filter((patch) => patch.status === "active");
  const rejected = patches.filter((patch) => patch.status === "rejected");
  const retired = patches.filter((patch) => patch.status === "retired");

  const model = {
    repo: path.basename(repoRoot),
    repoRoot,
    initialized: true,
    events: {
      total: events.length,
      unprocessed: unprocessedEvents.length,
    },
    patches: {
      total: patches.length,
      candidates: candidates.length,
      tested: tested.length,
      active: active.length,
      rejected: rejected.length,
      retired: retired.length,
    },
    agents: buildAgentModel(health),
  };

  model.next = nextAction(model);
  return model;
}

export function renderHome(
  model,
  { plain = false } = {},
) {
  const v = ui({ plain });
  const status = model.initialized
    ? v.badge("LOCAL", "success")
    : v.badge("READ ONLY", "warning");

  const behaviorLine = [
    v.metric(
      String(model.patches.candidates).padStart(2, "0"),
      "review",
      model.patches.candidates
        ? "warning"
        : "muted",
    ),
    v.metric(
      String(model.patches.tested).padStart(2, "0"),
      "tested",
      model.patches.tested
        ? "info"
        : "muted",
    ),
    v.metric(
      String(model.patches.active).padStart(2, "0"),
      "active",
      model.patches.active
        ? "success"
        : "muted",
    ),
  ].join("      ");

  const agentRows = model.agents.list ?? [];
  const agents = agentRows.length
    ? agentRows.map((agent) => {
        const tone = agent.ready
          ? "success"
          : agent.installed
            ? "warning"
            : "muted";
        return `${v.statusDot(tone)} ${v.a.bold(String(agent.displayName).padEnd(16))} ${v.a.dim(agentState(agent.installed, agent.ready))}`;
      })
    : [
        `${v.statusDot("muted")} ${v.a.bold("No adapters")}  ${v.a.dim("not detected")}`,
      ];

  const next = [
    v.a.bold(model.next.title),
    v.command(model.next.command),
  ];

  if (model.next.note) {
    next.push(v.a.dim(model.next.note));
  }

  return [
    v.header(
      "Git for AI behavior.",
      `${model.repo}  ${status}`,
    ),
    "",
    v.panel(
      "BEHAVIOR",
      [
        "",
        `  ${behaviorLine}`,
        "",
      ],
      {
        tone:
          model.patches.candidates > 0
            ? "warning"
            : model.patches.tested > 0
              ? "info"
              : "neutral",
        right: `${model.patches.total} total`,
      },
    ),
    "",
    v.panel(
      "AGENTS",
      agents.map((line) => `  ${line}`),
      {
        tone:
          model.agents.list?.some((agent) => agent.ready)
            ? "info"
            : "neutral",
      },
    ),
    "",
    v.panel(
      "NEXT",
      [
        "",
        ...next.map((line) => `  ${line}`),
        "",
      ],
      {
        tone: "violet",
        right: "human-gated",
      },
    ),
    "",
    `  ${v.a.dim(
      "local-first  ·  reversible  ·  human-gated",
    )}`,
    `  ${v.a.dim(
      "No cloud. No daemon. No silent promotion.",
    )}`,
  ].join("\n");
}

export function nextAction(model) {
  if (model.events.unprocessed > 0) {
    return {
      title: `Process ${model.events.unprocessed} new agent event${
        model.events.unprocessed === 1 ? "" : "s"
      }.`,
      command: "behavectl learn",
    };
  }

  if (model.patches.tested > 0) {
    return {
      title: `Review ${model.patches.tested} tested behavior change${
        model.patches.tested === 1 ? "" : "s"
      }.`,
      command: "behavectl review",
      note: "Promotion stays human-controlled.",
    };
  }

  if (model.patches.candidates > 0) {
    return {
      title: `Review ${model.patches.candidates} proposed behavior change${
        model.patches.candidates === 1 ? "" : "s"
      }.`,
      command: "behavectl review",
    };
  }

  const hasInstalledAgent =
    model.agents.list?.some((agent) => agent.installed) ||
    model.agents.claude ||
    model.agents.codex ||
    model.agents.codebuddy;

  if (!hasInstalledAgent) {
    return {
      title: "Connect a supported coding agent.",
      command: "behavectl agents",
      note: "Behavectl only requires the agents declared by a Behavior Patch.",
    };
  }

  return {
    title: "Keep working normally.",
    command: "behavectl inbox",
    note: "Behavectl will surface durable behavior changes when they appear.",
  };
}

function buildAgentModel(health) {
  const source = health?.agents?.length
    ? health.agents
    : [
        { id: "claude-code", displayName: "Claude Code", installed: Boolean(health?.claude?.installed) },
        { id: "codex", displayName: "Codex", installed: Boolean(health?.codex?.installed) },
      ];
  const list = source.map((agent) => ({
    id: agent.id,
    displayName: agent.displayName ?? agent.id,
    installed: Boolean(agent.installed),
    ready: Boolean(health?.ready?.[agent.id] ?? (
      agent.id === "claude-code"
        ? health?.realBehaviorDiffReady?.claude
        : health?.realBehaviorDiffReady?.[agent.id]
    )),
    maturity: agent.maturity ?? null,
  }));

  // Legacy fields stay available to callers during the alpha migration.
  return {
    list,
    claude: Boolean(health?.claude?.installed),
    codex: Boolean(health?.codex?.installed),
    codebuddy: Boolean(health?.codebuddy?.installed),
    claudeReady: Boolean(health?.realBehaviorDiffReady?.claude),
    codexReady: Boolean(health?.realBehaviorDiffReady?.codex),
    codebuddyReady: Boolean(health?.realBehaviorDiffReady?.codebuddy),
  };
}

function agentState(installed, available) {
  if (available) return "available · auth checked on run";
  if (installed) return "installed";
  return "not detected";
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
