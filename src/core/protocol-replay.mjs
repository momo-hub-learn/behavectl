import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { agentDefinition, displayAgentName } from "../adapters/registry.mjs";

export async function replayProtocolFile({ agent, file }) {
  const text = await fs.readFile(file, "utf8");
  const source = file instanceof URL ? fileURLToPath(file) : path.resolve(file);
  return replayProtocol({ agent, text, source });
}

export function replayProtocol({ agent, text, source = "<memory>" }) {
  const adapter = agentDefinition(agent);
  if (!adapter) {
    throw new Error(`Unknown replay agent: ${agent}. Load or install its Agent Adapter first.`);
  }
  if (!adapter.capabilities.includes("replay") || typeof adapter.replayProtocol !== "function") {
    throw new Error(`Agent Adapter ${adapter.id} does not declare replay capability.`);
  }
  const report = adapter.replayProtocol({ text, source });
  return { ...report, agent: adapter.id, source };
}

export async function replayTraceBundle(traceDir) {
  let root = path.resolve(traceDir);

  try {
    await fs.access(path.join(root, "trace-manifest.json"));
  } catch {
    const nested = path.join(root, "traces");
    await fs.access(path.join(nested, "trace-manifest.json"));
    root = nested;
  }

  const manifest = JSON.parse(
    await fs.readFile(path.join(root, "trace-manifest.json"), "utf8"),
  );

  const reports = [];
  for (const trace of manifest.traces ?? []) {
    const report = await replayProtocolFile({
      agent: trace.runner,
      file: path.join(root, trace.stdout),
    });
    reports.push({
      runner: trace.runner,
      arm: trace.arm,
      trial: trace.trial,
      file: trace.stdout,
      report,
    });
  }

  return {
    schema: "behavectl.protocol-bundle-replay.v2",
    traceDir: root,
    traceCount: reports.length,
    healthy: reports.length > 0 && reports.every((item) => item.report.protocolHealthy),
    reports,
  };
}

export function formatProtocolBundleReplay(bundle) {
  const lines = [
    "BEHAVECTL",
    "Protocol Replay Lab",
    "",
    `Bundle     ${bundle.traceDir}`,
    `Traces     ${bundle.traceCount}`,
    "",
  ];

  for (const item of bundle.reports) {
    const report = item.report;
    lines.push(
      `${report.protocolHealthy ? "✓" : "✗"} ${displayAgentName(item.runner).padEnd(16)} trial ${item.trial} ${item.arm.padEnd(9)} ${String(report.eventCount).padStart(3)} events  ${String(report.commands.length).padStart(2)} commands`,
    );
    for (const warning of report.warnings ?? []) lines.push(`    ! ${warning}`);
  }

  lines.push("");
  lines.push(
    bundle.healthy
      ? "✓ all captured traces replay cleanly with their registered adapters"
      : "✗ protocol drift or adapter parser incompatibility detected",
  );
  return lines.join("\n");
}

export function formatProtocolReplay(report) {
  const lines = [
    "BEHAVECTL",
    "Protocol Replay",
    "",
    `Agent       ${displayAgentName(report.agent)}`,
    `Source      ${report.source}`,
    `JSON events ${report.eventCount}`,
    `Commands    ${report.commands.length}`,
  ];

  if (Number.isFinite(report.toolUseCount) && report.toolUseCount > 0) {
    lines.push(`Tool uses   ${report.toolUseCount}`);
  }
  if (Number.isFinite(report.fileChangeCount) && report.fileChangeCount > 0) {
    lines.push(`File changes ${report.fileChangeCount}`);
  }

  lines.push(`Usage       ${report.usagePresent ? "present" : "not observed"}`);
  lines.push(`Terminal    ${report.terminalEventPresent ? "observed" : "not observed"}`);
  lines.push("");
  lines.push("Event types");
  for (const [type, count] of Object.entries(report.eventTypes ?? {})) {
    lines.push(`  ${String(count).padStart(3)}  ${type}`);
  }

  if (Object.keys(report.itemTypes ?? {}).length) {
    lines.push("");
    lines.push("Item types");
    for (const [type, count] of Object.entries(report.itemTypes)) {
      lines.push(`  ${String(count).padStart(3)}  ${type}`);
    }
  }

  if (report.commands.length) {
    lines.push("");
    lines.push("Commands");
    for (const command of report.commands) lines.push(`  $ ${command}`);
  }

  lines.push("");
  lines.push(report.protocolHealthy ? "✓ parser contract looks healthy" : "✗ parser contract needs inspection");
  for (const warning of report.warnings ?? []) lines.push(`  ! ${warning}`);
  return lines.join("\n");
}
