import path from "node:path";
import { makeId } from "./id.mjs";

export function normalizeClaudeHook(raw, repoRoot) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Claude hook payload must be a JSON object.");
  }

  const eventName = String(raw.hook_event_name ?? "Unknown");
  const cwd = typeof raw.cwd === "string" ? raw.cwd : repoRoot;
  const sessionId =
    typeof raw.session_id === "string" ? raw.session_id : undefined;

  const data = {};

  if (eventName === "UserPromptSubmit" && typeof raw.prompt === "string") {
    data.prompt = raw.prompt;
  }

  if (
    ["PreToolUse", "PostToolUse", "PostToolUseFailure"].includes(eventName)
  ) {
    if (typeof raw.tool_name === "string") data.toolName = raw.tool_name;
    if (raw.tool_input && typeof raw.tool_input === "object") {
      data.toolInput = raw.tool_input;
    }
    if (typeof raw.tool_use_id === "string") data.toolUseId = raw.tool_use_id;
    if (eventName === "PostToolUse" && raw.tool_response !== undefined) {
      data.toolResponse = raw.tool_response;
    }
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

  if (
    eventName === "FileChanged" &&
    typeof raw.file_path === "string"
  ) {
    data.filePath = raw.file_path;
    if (typeof raw.event === "string") data.event = raw.event;
  }

  return {
    schema: "behavectl.event.v1",
    id: makeId("evt"),
    source: "claude-code",
    kind: eventName,
    observedAt: new Date().toISOString(),
    repoRoot: path.resolve(repoRoot),
    cwd: path.resolve(cwd),
    sessionId,
    data,
    rawMeta: {
      permissionMode:
        typeof raw.permission_mode === "string" ? raw.permission_mode : undefined,
      agentId: typeof raw.agent_id === "string" ? raw.agent_id : undefined,
      agentType: typeof raw.agent_type === "string" ? raw.agent_type : undefined,
    },
  };
}
