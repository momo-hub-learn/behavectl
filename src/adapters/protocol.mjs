import {
  parseClaudeJsonl,
  parseCodexJsonl,
  parseCodeBuddyJsonl,
} from "../core/eval/runners.mjs";

export function replayClaudeProtocol({ text, source = "<memory>" }) {
  const parsed = parseClaudeJsonl(text);
  const eventTypes = histogram(parsed.events.map((event) => event?.type ?? "<missing>"));
  const blockTypes = [];
  for (const event of parsed.events) {
    const blocks = event?.type === "assistant" ? event?.message?.content ?? event?.content : undefined;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) blockTypes.push(block?.type ?? "<missing>");
  }
  const terminalEventPresent = parsed.events.some((event) => event?.type === "result");
  const warnings = [];
  if (parsed.events.length === 0) warnings.push("No JSON events were parsed.");
  if (!terminalEventPresent && parsed.events.length > 0) warnings.push("No Claude result event was observed.");
  return {
    schema: "behavectl.protocol-replay.v1",
    agent: "claude-code",
    source,
    eventCount: parsed.events.length,
    eventTypes,
    contentBlockTypes: histogram(blockTypes),
    commands: parsed.commands,
    toolUseCount: parsed.toolUses.length,
    fileChangeCount: 0,
    usagePresent: Boolean(parsed.usage),
    terminalEventPresent,
    warnings,
    protocolHealthy: parsed.events.length > 0 && terminalEventPresent,
  };
}

export function replayCodexProtocol({ text, source = "<memory>" }) {
  const parsed = parseCodexJsonl(text);
  const eventTypes = histogram(parsed.events.map((event) => event?.type ?? "<missing>"));
  const itemTypes = histogram(parsed.events.map((event) => event?.item?.type).filter(Boolean));
  const terminalEventPresent = parsed.events.some((event) => event?.type === "turn.completed");
  const warnings = [];
  if (parsed.events.length === 0) warnings.push("No JSON events were parsed.");
  if (!terminalEventPresent && parsed.events.length > 0) warnings.push("No Codex turn.completed event was observed.");
  return {
    schema: "behavectl.protocol-replay.v1",
    agent: "codex",
    source,
    eventCount: parsed.events.length,
    eventTypes,
    itemTypes,
    commands: parsed.commands,
    toolUseCount: 0,
    fileChangeCount: parsed.fileChanges.length,
    usagePresent: Boolean(parsed.usage),
    terminalEventPresent,
    warnings,
    protocolHealthy: parsed.events.length > 0 && terminalEventPresent,
  };
}

export function replayCodeBuddyProtocol({ text, source = "<memory>" }) {
  const parsed = parseCodeBuddyJsonl(text);
  const eventTypes = histogram(parsed.events.map((event) => event?.type ?? "<missing>"));
  const terminalEventPresent = parsed.events.some((event) => event?.type === "result");
  const warnings = [];
  if (parsed.events.length === 0) warnings.push("No JSON events were parsed.");
  if (!terminalEventPresent && parsed.events.length > 0) warnings.push("No CodeBuddy result event was observed.");
  return {
    schema: "behavectl.protocol-replay.v1",
    agent: "codebuddy",
    source,
    eventCount: parsed.events.length,
    eventTypes,
    itemTypes: {},
    commands: parsed.commands,
    toolUseCount: parsed.toolUses.length,
    fileChangeCount: 0,
    usagePresent: Boolean(parsed.usage),
    terminalEventPresent,
    warnings,
    protocolHealthy: parsed.events.length > 0 && terminalEventPresent,
  };
}

function histogram(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
}
