import path from "node:path";
import { makeId } from "../../core/id.mjs";

export function normalizeCodexHook(raw, repoRoot) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Codex hook payload must be a JSON object.");
  }

  const eventName = String(raw.hook_event_name ?? "Unknown");
  const cwd = typeof raw.cwd === "string" ? raw.cwd : repoRoot;

  const data = {};

  if (eventName === "UserPromptSubmit" && typeof raw.prompt === "string") {
    data.prompt = raw.prompt;
  }

  if (["PreToolUse", "PostToolUse"].includes(eventName)) {
    if (typeof raw.tool_name === "string") data.toolName = raw.tool_name;
    if (raw.tool_input && typeof raw.tool_input === "object") {
      data.toolInput = raw.tool_input;
    }
    if (raw.tool_output !== undefined) data.toolOutput = raw.tool_output;
  }

  if (eventName === "Stop") {
    if (typeof raw.last_assistant_message === "string") {
      data.lastAssistantMessage = raw.last_assistant_message;
    }
    if (typeof raw.stop_hook_active === "boolean") {
      data.stopHookActive = raw.stop_hook_active;
    }
  }

  if (eventName === "SessionEnd" && typeof raw.reason === "string") {
    data.reason = raw.reason;
  }

  return {
    schema: "behavectl.event.v1",
    id: makeId("evt"),
    source: "codex",
    kind: eventName,
    observedAt: new Date().toISOString(),
    repoRoot: path.resolve(repoRoot),
    cwd: path.resolve(cwd),
    sessionId:
      typeof raw.session_id === "string" ? raw.session_id : undefined,
    turnId: typeof raw.turn_id === "string" ? raw.turn_id : undefined,
    data,
    rawMeta: {
      model: typeof raw.model === "string" ? raw.model : undefined,
      permissionMode:
        typeof raw.permission_mode === "string"
          ? raw.permission_mode
          : undefined,
    },
  };
}
