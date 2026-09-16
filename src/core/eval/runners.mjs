import { commandExists, runProcess } from "./process.mjs";

export function renderBehaviorPrompt(patch) {
  return [
    "BEHAVECTL CANDIDATE PROJECT BEHAVIOR:",
    patch.behavior.statement,
    "",
    "Treat this as a project-level behavioral requirement for this evaluation.",
  ].join("\n");
}

function parseJsonLines(text) {
  const events = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // JSONL runners may emit non-JSON diagnostics; stderr is retained separately.
    }
  }
  return events;
}

export function parseClaudeJsonl(text) {
  const events = parseJsonLines(text);
  const commands = [];
  const toolUses = [];
  let usage;
  let resultText;

  for (const event of events) {
    // Claude Code stream-json assistant messages contain content blocks.
    const blocks =
      event?.type === "assistant"
        ? event?.message?.content ?? event?.content
        : undefined;

    if (Array.isArray(blocks)) {
      for (const block of blocks) {
        if (block?.type !== "tool_use") continue;

        toolUses.push({
          name: block.name,
          input: block.input,
          id: block.id,
        });

        if (
          ["Bash", "bash", "PowerShell"].includes(block.name) &&
          typeof block?.input?.command === "string"
        ) {
          commands.push(block.input.command);
        }
      }
    }

    if (event?.type === "result") {
      usage = event.usage ?? usage;
      if (typeof event.result === "string") resultText = event.result;
    }
  }

  return {
    commands: [...new Set(commands)],
    toolUses,
    events,
    usage,
    resultText,
  };
}

export function parseCodeBuddyJsonl(text) {
  const events = parseJsonLines(text);
  const commands = [];
  const toolUses = [];
  let usage;
  let resultText;

  for (const event of events) {
    const blocks =
      event?.type === "assistant"
        ? event?.message?.content ?? event?.content
        : undefined;

    if (Array.isArray(blocks)) {
      for (const block of blocks) {
        if (block?.type === "text" && typeof block.text === "string") {
          resultText = block.text;
        }
        if (block?.type !== "tool_use") continue;
        toolUses.push({ name: block.name, input: block.input, id: block.id });
        if (
          ["Bash", "bash", "PowerShell"].includes(block.name) &&
          typeof block?.input?.command === "string"
        ) {
          commands.push(block.input.command);
        }
      }
    }

    if (event?.type === "result") {
      usage = event.usage ?? event?.metadata?.usage ?? usage;
      if (typeof event.result === "string") resultText = event.result;
      if (typeof event.response === "string") resultText = event.response;
    }
  }

  return {
    commands: [...new Set(commands)],
    toolUses,
    events,
    usage,
    resultText,
  };
}

export function parseCodexJsonl(text) {
  const events = parseJsonLines(text);
  const commands = [];
  const commandItems = [];
  const fileChanges = [];
  let usage;
  let resultText;

  for (const event of events) {
    if (
      ["item.started", "item.updated", "item.completed"].includes(event?.type) &&
      event?.item?.type === "command_execution"
    ) {
      if (typeof event.item.command === "string") {
        commands.push(event.item.command);
      }
      commandItems.push(event.item);
    }

    if (
      event?.type === "item.completed" &&
      event?.item?.type === "file_change" &&
      Array.isArray(event.item.changes)
    ) {
      fileChanges.push(...event.item.changes);
    }

    if (
      event?.type === "item.completed" &&
      event?.item?.type === "agent_message" &&
      typeof event.item.text === "string"
    ) {
      resultText = event.item.text;
    }

    if (event?.type === "turn.completed") {
      usage = event.usage ?? usage;
    }
  }

  return {
    commands: [...new Set(commands)],
    commandItems,
    fileChanges,
    events,
    usage,
    resultText,
  };
}

// Backward-compatible utility for external consumers; core runners use the
// vendor-specific parsers above.
export function parseJsonlCommands(text) {
  const codex = parseCodexJsonl(text);
  if (codex.commandItems.length > 0) {
    return { commands: codex.commands, events: codex.events };
  }

  const claude = parseClaudeJsonl(text);
  return { commands: claude.commands, events: claude.events };
}


function tokenCount(usage) {
  if (!usage || typeof usage !== "object") return null;

  const input =
    Number(usage.input_tokens ?? usage.inputTokens ?? 0) +
    Number(usage.cache_creation_input_tokens ?? 0) +
    Number(usage.cached_input_tokens ?? 0);

  const output =
    Number(usage.output_tokens ?? usage.outputTokens ?? 0);

  const total = input + output;
  return Number.isFinite(total) && total > 0 ? total : null;
}

export class ClaudeRunner {
  constructor({
    maxTurns = 8,
    timeoutMs = 180_000,
    traceSink = null,
  } = {}) {
    this.id = "claude-code";
    this.maxTurns = maxTurns;
    this.timeoutMs = timeoutMs;
    this.traceSink = traceSink;
  }

  async available() {
    return commandExists("claude");
  }

  async run({ workspace, task, patch }) {
    if (!(await this.available())) {
      throw new Error(
        "Claude Code CLI not found. Install/authenticate `claude` before running a real Behavior Diff.",
      );
    }

    const args = [
      "--bare",
      "--restricted",
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--max-turns",
      String(this.maxTurns),
      "--max-budget-usd",
      "1.00",
      "--no-session-persistence",
      "--permission-mode",
      "auto",
      "--tools",
      "Bash,Edit,Read",
    ];

    if (patch) {
      args.push("--append-system-prompt", renderBehaviorPrompt(patch));
    }

    args.push(task);

    const result = await runProcess("claude", args, {
      cwd: workspace,
      timeoutMs: this.timeoutMs,
      allowFailure: true,
    });

    if (this.traceSink) {
      await this.traceSink({
        runner: this.id,
        arm: patch ? "candidate" : "baseline",
        stdout: result.stdout,
        stderr: result.stderr,
      });
    }

    const parsed = parseClaudeJsonl(result.stdout);

    const claudeTerminal =
      parsed.events.some(
        (event) => event?.type === "result",
      );

    if (
      result.exitCode === 0 &&
      (
        parsed.events.length === 0 ||
        !claudeTerminal
      )
    ) {
      const error = new Error(
        "Claude Code exited successfully but its stream-json contract was incomplete (missing parsed events or terminal result). The CLI protocol may have changed.",
      );
      error.code = "BCTL_PROTOCOL_PARSE_FAILED";
      error.runner = this.id;
      throw error;
    }

    return {
      commands: parsed.commands,
      output: parsed.resultText ?? result.stdout,
      exitCode: result.exitCode,
      metadata: {
        runner: this.id,
        timedOut: result.timedOut,
        stderr: result.stderr,
        protocolParser: "behavectl.claude-stream-json.v1",
        eventCount: parsed.events.length,
        usage: parsed.usage,
        tokenCount: tokenCount(parsed.usage),
        toolUseCount: parsed.toolUses.length,
        durationMs: result.durationMs,
      },
    };
  }
}


export function buildCodexExecArgs({ task, patch }) {
  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--sandbox",
    "workspace-write",
  ];

  if (patch) {
    // Codex config supports developer_instructions as a separate message.
    // Using a CLI config override keeps candidate behavior out of ordinary
    // user-task text and gives the A/B boundary a cleaner semantic layer.
    args.push(
      "-c",
      `developer_instructions=${JSON.stringify(renderBehaviorPrompt(patch))}`,
    );
  }

  args.push(task);
  return args;
}

// Codex input_tokens includes cached input; reasoning tokens are part of output.
export function countCodexTokens(usage) {
  if (!usage || !Number.isFinite(usage.input_tokens) || !Number.isFinite(usage.output_tokens) || usage.input_tokens < 0 || usage.output_tokens < 0) return null;
  const total = usage.input_tokens + usage.output_tokens;
  return Number.isFinite(total) ? total : null;
}

export function assertCodexExecutionAvailable(parsed) {
  // Some CLI builds return turn.completed even when every tool was blocked.
  if (!parsed.commands.length && /sandbox(?:-exec: sandbox_apply|_apply): Operation not permitted/.test(parsed.resultText ?? '')) {
    const error = new Error('Codex reported that its execution sandbox could not start. No commands were recorded; this run cannot establish a behavior verdict. Run certification in a supported native terminal environment.');
    error.code = 'BCTL_EVAL_RUNNER_FAILED';
    error.runner = 'codex';
    throw error;
  }
}

export class CodexRunner {
  constructor({
    timeoutMs = 180_000,
    traceSink = null,
  } = {}) {
    this.id = "codex";
    this.timeoutMs = timeoutMs;
    this.traceSink = traceSink;
  }

  async available() {
    return commandExists("codex");
  }

  async run({ workspace, task, patch }) {
    if (!(await this.available())) {
      throw new Error(
        "Codex CLI not found. Install/authenticate `codex` before running a real Behavior Diff.",
      );
    }

    // Candidate behavior is injected as Codex developer instructions,
    // separate from the ordinary user task.
    const args = buildCodexExecArgs({ task, patch });

    const result = await runProcess("codex", args, {
      cwd: workspace,
      timeoutMs: this.timeoutMs,
      allowFailure: true,
    });

    if (this.traceSink) {
      await this.traceSink({
        runner: this.id,
        arm: patch ? "candidate" : "baseline",
        stdout: result.stdout,
        stderr: result.stderr,
      });
    }

    const parsed = parseCodexJsonl(result.stdout);
    assertCodexExecutionAvailable(parsed);

    const codexTerminal =
      parsed.events.some(
        (event) => event?.type === "turn.completed",
      );

    if (
      result.exitCode === 0 &&
      (
        parsed.events.length === 0 ||
        !codexTerminal
      )
    ) {
      const error = new Error(
        "Codex exited successfully but its exec JSONL contract was incomplete (missing parsed events or turn.completed). The CLI protocol may have changed.",
      );
      error.code = "BCTL_PROTOCOL_PARSE_FAILED";
      error.runner = this.id;
      throw error;
    }

    return {
      commands: parsed.commands,
      output: parsed.resultText ?? result.stdout,
      exitCode: result.exitCode,
      metadata: {
        runner: this.id,
        timedOut: result.timedOut,
        stderr: result.stderr,
        protocolParser: "behavectl.codex-exec-jsonl.v1",
        eventCount: parsed.events.length,
        usage: parsed.usage,
        tokenCount: countCodexTokens(parsed.usage),
        commandItemCount: parsed.commandItems.length,
        fileChangeCount: parsed.fileChanges.length,
        durationMs: result.durationMs,
      },
    };
  }
}

export function buildCodeBuddyArgs({ task, patch, maxTurns = 8 }) {
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--max-turns",
    String(maxTurns),
    "--no-session-persistence",
    "--dangerously-skip-permissions",
    "--allowedTools",
    "Bash,Edit,Read,Write,Grep,Glob",
  ];

  if (patch) {
    args.push("--append-system-prompt", renderBehaviorPrompt(patch));
  }

  args.push(task);
  return args;
}

async function resolveCodeBuddyCommand() {
  if (await commandExists("codebuddy")) return "codebuddy";
  if (await commandExists("cbc")) return "cbc";
  return null;
}

export class CodeBuddyRunner {
  constructor({
    maxTurns = 8,
    timeoutMs = 180_000,
    traceSink = null,
  } = {}) {
    this.id = "codebuddy";
    this.maxTurns = maxTurns;
    this.timeoutMs = timeoutMs;
    this.traceSink = traceSink;
  }

  async available() {
    return Boolean(await resolveCodeBuddyCommand());
  }

  async run({ workspace, task, patch }) {
    const command = await resolveCodeBuddyCommand();
    if (!command) {
      throw new Error(
        "CodeBuddy Code CLI not found. Install/authenticate `codebuddy` (or `cbc`) before running a real Behavior Diff.",
      );
    }

    const args = buildCodeBuddyArgs({
      task,
      patch,
      maxTurns: this.maxTurns,
    });

    const result = await runProcess(command, args, {
      cwd: workspace,
      timeoutMs: this.timeoutMs,
      allowFailure: true,
      env: {
        CODEBUDDY_CODE_DISABLE_BACKGROUND_TASKS: "1",
        CODEBUDDY_IS_SANDBOX: "1",
        DISABLE_AUTOUPDATER: "1",
      },
    });

    if (this.traceSink) {
      await this.traceSink({
        runner: this.id,
        arm: patch ? "candidate" : "baseline",
        stdout: result.stdout,
        stderr: result.stderr,
      });
    }

    const parsed = parseCodeBuddyJsonl(result.stdout);
    const terminal = parsed.events.some((event) => event?.type === "result");

    if (
      result.exitCode === 0 &&
      (parsed.events.length === 0 || !terminal)
    ) {
      const error = new Error(
        "CodeBuddy Code exited successfully but its stream-json contract was incomplete (missing parsed events or terminal result). The CLI protocol may have changed.",
      );
      error.code = "BCTL_PROTOCOL_PARSE_FAILED";
      error.runner = this.id;
      throw error;
    }

    return {
      commands: parsed.commands,
      output: parsed.resultText ?? result.stdout,
      exitCode: result.exitCode,
      metadata: {
        runner: this.id,
        command,
        timedOut: result.timedOut,
        stderr: result.stderr,
        protocolParser: "behavectl.codebuddy-stream-json.v1",
        eventCount: parsed.events.length,
        usage: parsed.usage,
        tokenCount: tokenCount(parsed.usage),
        toolUseCount: parsed.toolUses.length,
        durationMs: result.durationMs,
      },
    };
  }
}

/**
 * Test/demo runner for the evaluation engine itself.
 * It never presents itself as a real Claude/Codex evaluation.
 */
export class FixtureRunner {
  constructor(script) {
    this.id = "fixture";
    this.script = script;
  }

  async available() {
    return true;
  }

  async run(context) {
    return this.script(context);
  }
}
