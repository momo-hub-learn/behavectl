import fs from "node:fs/promises";
import path from "node:path";
import { makeId } from "../id.mjs";
import { createEvalWorkspace } from "./workspace.mjs";
import {
  diffFiles,
  runRegressionCommands,
  snapshotFiles,
} from "./observe.mjs";
import { evaluateAssertions } from "./assertions.mjs";
import { behaviorPatchDigest, behaviorSpecDigest } from "../fingerprint.mjs";

async function runArm({
  repoRoot,
  label,
  runner,
  spec,
  patch,
}) {
  const sandbox = await createEvalWorkspace(repoRoot, label);

  try {
    for (const command of spec.setupCommands ?? []) {
      const results = await runRegressionCommands(sandbox.path, [command]);
      if (results[0]?.exitCode !== 0) {
        throw new Error(
          `Eval setup failed: ${command}\n${results[0]?.stderr ?? ""}`,
        );
      }
    }

    const filesBefore = await snapshotFiles(sandbox.path);
    const observation = await runner.run({
      workspace: sandbox.path,
      task: spec.task,
      patch,
    });

    if (
      typeof observation?.exitCode === "number" &&
      observation.exitCode !== 0
    ) {
      const stderr =
        observation?.metadata?.stderr ??
        observation?.stderr ??
        "";
      const error = new Error(
        `${runner.id} evaluation runner exited ${observation.exitCode}. ` +
          `This is an evaluation infrastructure error, not a behavior verdict.` +
          (stderr ? `\n${String(stderr).slice(0, 1200)}` : ""),
      );
      error.code = "BCTL_EVAL_RUNNER_FAILED";
      error.runner = runner.id;
      error.exitCode = observation.exitCode;
      throw error;
    }

    const regressionResults = await runRegressionCommands(
      sandbox.path,
      spec.regressionCommands ?? [],
    );

    const filesAfter = await snapshotFiles(sandbox.path);
    const fileDiff = diffFiles(filesBefore, filesAfter);

    const completeObservation = {
      ...observation,
      filesCreated: fileDiff.created,
      filesDeleted: fileDiff.deleted,
      fileChanges: fileDiff.changes,
      fileContentOmissions: fileDiff.omitted,
      regressionResults,
      workspaceMode: sandbox.mode,
    };

    const assertion = await evaluateAssertions(
      spec,
      completeObservation,
      sandbox.path,
    );

    return {
      observation: completeObservation,
      checks: assertion.checks,
      passed: assertion.passed,
    };
  } finally {
    await sandbox.cleanup();
  }
}

export async function evaluateBehaviorPatch({
  repoRoot,
  patch,
  spec,
  runner,
  onProgress = async () => {},
}) {
  await onProgress({ phase: "baseline", state: "running" });
  const baseline = await runArm({
    repoRoot,
    label: "baseline",
    runner,
    spec,
    patch: null,
  });
  await onProgress({ phase: "baseline", state: "done", result: baseline });

  await onProgress({ phase: "candidate", state: "running" });
  const candidate = await runArm({
    repoRoot,
    label: "candidate",
    runner,
    spec,
    patch,
  });
  await onProgress({ phase: "candidate", state: "done", result: candidate });

  const improved =
    candidate.passed &&
    (!baseline.passed || score(candidate.checks) >= score(baseline.checks));

  const evaluation = {
    schema: "behavectl.evaluation.v2",
    id: makeId("eval"),
    patchId: patch.id,
    patchVersion: patch.version ?? null,
    patchDigest: behaviorPatchDigest(patch),
    runner: runner.id,
    specId: spec.id,
    specDigest: behaviorSpecDigest(spec),
    createdAt: new Date().toISOString(),
    baseline,
    candidate,
    verdict:
      candidate.passed && improved
        ? "promote"
        : candidate.passed
          ? "neutral"
          : "reject",
  };

  await onProgress({ phase: "complete", state: "done", result: evaluation });
  return evaluation;
}

function score(checks) {
  if (!checks.length) return 0;
  return checks.filter((check) => check.passed).length / checks.length;
}

export function formatBehaviorDiff(evaluation) {
  const beforeByKey = new Map(
    evaluation.baseline.checks.map((check) => [key(check), check]),
  );
  const afterByKey = new Map(
    evaluation.candidate.checks.map((check) => [key(check), check]),
  );

  const keys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])];

  const rows = keys.map((id) => {
    const before = beforeByKey.get(id);
    const after = afterByKey.get(id);
    return {
      label: (after ?? before)?.label ?? humanLabel(after ?? before),
      before: before?.passed ? "PASS" : "FAIL",
      after: after?.passed ? "PASS" : "FAIL",
    };
  });

  const width = Math.max(18, ...rows.map((row) => row.label.length));

  const lines = [
    `Behavior Diff · ${evaluation.patchId}`,
    "",
    `${"Check".padEnd(width)}  Before  After`,
    `${"─".repeat(width)}  ──────  ─────`,
  ];

  for (const row of rows) {
    lines.push(
      `${row.label.padEnd(width)}  ${row.before.padEnd(6)}  ${row.after}`,
    );
  }

  const metrics = metricRows(evaluation);
  if (metrics.length) {
    lines.push("");
    lines.push("Work");
    lines.push(`${"Metric".padEnd(18)}  Before  After   Δ`);
    lines.push(`${"─".repeat(18)}  ──────  ─────   ─────`);
    for (const row of metrics) {
      lines.push(
        `${row.label.padEnd(18)}  ${row.before.padStart(6)}  ${row.after.padStart(5)}   ${row.delta}`,
      );
    }
  }

  lines.push("");
  lines.push(`Verdict: ${evaluation.verdict.toUpperCase()}`);

  if (evaluation.runner === "fixture") {
    lines.push("Runner: fixture (engine test only; not a real agent evaluation)");
  }

  return lines.join("\n");
}

function metricRows(evaluation) {
  const before = evaluation?.baseline?.observation?.metadata ?? {};
  const after = evaluation?.candidate?.observation?.metadata ?? {};
  const rows = [];

  addMetric(rows, "Tokens", before.tokenCount, after.tokenCount, formatCompact);
  addMetric(rows, "Tool calls", before.toolUseCount, after.toolUseCount, formatInteger);
  addMetric(
    rows,
    "Commands",
    evaluation?.baseline?.observation?.commands?.length,
    evaluation?.candidate?.observation?.commands?.length,
    formatInteger,
  );
  addMetric(rows, "Time", before.durationMs, after.durationMs, formatDuration);

  return rows;
}

function addMetric(rows, label, before, after, formatter) {
  if (
    before === null || before === undefined ||
    after === null || after === undefined ||
    !Number.isFinite(Number(before)) ||
    !Number.isFinite(Number(after))
  ) return;

  const b = Number(before);
  const a = Number(after);
  rows.push({
    label,
    before: formatter(b),
    after: formatter(a),
    delta: formatDelta(b, a),
  });
}

function formatInteger(value) {
  return String(Math.round(value));
}

function formatCompact(value) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)}k`;
  }
  return String(Math.round(value));
}

function formatDuration(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatDelta(before, after) {
  if (before === 0) return after === 0 ? "—" : `+${after}`;
  const pct = ((after - before) / before) * 100;
  const rounded = Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function key(check) {
  return check.id ?? `${check.kind}:${check.target}`;
}

function humanLabel(check) {
  const map = {
    commandMatches: `uses ${check.target}`,
    commandNotMatches: `avoids ${check.target}`,
    fileExists: `creates ${check.target}`,
    fileNotExists: `avoids ${check.target}`,
    outputContains: `output: ${check.target}`,
    regressionCommand: `regression: ${check.target}`,
  };
  return map[check.kind] ?? `${check.kind} ${check.target}`;
}

export async function loadBehaviorSpec(file) {
  const raw = JSON.parse(await fs.readFile(path.resolve(file), "utf8"));

  if (!raw?.id || typeof raw.id !== "string") {
    throw new Error("Behavior spec requires string `id`.");
  }
  if (!raw?.task || typeof raw.task !== "string" || !raw.task.trim()) {
    throw new Error("Behavior spec requires a non-empty string `task`.");
  }
  const hasChecks = Array.isArray(raw.checks) && raw.checks.length > 0;
  const hasLegacyExpect = raw.expect && typeof raw.expect === "object";

  if (!hasChecks && !hasLegacyExpect) {
    throw new Error("Behavior spec requires non-empty `checks` or legacy `expect`.");
  }

  if (hasChecks) {
    for (const check of raw.checks) {
      if (!check?.id || !check?.label || !check?.kind) {
        throw new Error(
          "Each Behavior Spec check requires `id`, `label`, and `kind`.",
        );
      }

      const fileContentCheck =
        check.kind === "file_contains" ||
        check.kind === "file_not_contains";

      if (fileContentCheck) {
        if (
          typeof check?.path !== "string" ||
          !check.path ||
          typeof check?.value !== "string"
        ) {
          throw new Error(
            `${check.kind} requires string \`path\` and string \`value\`.`,
          );
        }
      } else if (typeof check?.value !== "string") {
        throw new Error(
          `Behavior Spec check ${check.id} requires string \`value\`.`,
        );
      }
    }
  }

  return raw;
}
