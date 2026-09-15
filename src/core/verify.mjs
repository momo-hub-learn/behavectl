import { makeId } from "./id.mjs";
import { evaluateBehaviorPatch } from "./eval/engine.mjs";
import { behaviorPatchDigest, behaviorSpecDigest } from "./fingerprint.mjs";
import { displayAgentName } from "../adapters/registry.mjs";

export async function verifyAcrossAgents({
  repoRoot,
  patch,
  spec,
  runners,
  repeat = 1,
  onProgress = async () => {},
}) {
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) {
    throw new Error("repeat must be an integer between 1 and 10.");
  }

  const evaluations = [];

  for (const runner of runners) {
    for (let trial = 1; trial <= repeat; trial++) {
      await onProgress({
        agent: runner.id,
        phase: "agent",
        state: "running",
        trial,
        repeat,
      });

      const evaluation = await evaluateBehaviorPatch({
        repoRoot,
        patch,
        spec,
        runner,
        onProgress: async (event) =>
          onProgress({
            agent: runner.id,
            trial,
            repeat,
            ...event,
          }),
      });

      evaluation.trial = trial;
      evaluation.repeat = repeat;
      evaluations.push(evaluation);

      await onProgress({
        agent: runner.id,
        phase: "agent",
        state: "done",
        trial,
        repeat,
        result: evaluation,
      });
    }
  }

  return buildVerificationRecord({
    patch,
    spec,
    evaluations,
    repeat,
  });
}


export function buildVerificationRecord({
  patch,
  spec,
  evaluations,
  repeat = 1,
}) {
  const agents = aggregateAgents(evaluations, repeat);
  const passing = agents
    .filter((agent) => agent.passedTrials === agent.totalTrials)
    .map((agent) => agent.runner);

  const requiredTargets = [...new Set(patch.targets ?? [])].sort();
  const verifiedTargets = agents.map((agent) => agent.runner).sort();
  const missingTargets = requiredTargets.filter(
    (target) => !verifiedTargets.includes(target),
  );

  const allStable =
    agents.length > 0 &&
    agents.every((agent) => agent.passedTrials === agent.totalTrials);

  const fullTargetCoverage =
    missingTargets.length === 0;

  return {
    schema: "behavectl.cross-verification.v3",
    id: makeId("verify"),
    patchId: patch.id,
    patchVersion: patch.version ?? null,
    patchDigest: behaviorPatchDigest(patch),
    specId: spec.id,
    specDigest: behaviorSpecDigest(spec),
    createdAt: new Date().toISOString(),
    repeat,
    evaluations,
    agents,
    coverage: {
      agents: verifiedTargets,
      passing,
      requiredTargets,
      missingTargets,
      total: agents.length,
      passed: passing.length,
      totalTrials: evaluations.length,
      passedTrials: evaluations.filter(
        (evaluation) => evaluation.verdict === "promote",
      ).length,
    },
    verdict:
      allStable && fullTargetCoverage
        ? "promote"
        : "mixed",
  };
}


function aggregateAgents(evaluations, repeat) {
  const byRunner = new Map();

  for (const evaluation of evaluations) {
    const bucket = byRunner.get(evaluation.runner) ?? [];
    bucket.push(evaluation);
    byRunner.set(evaluation.runner, bucket);
  }

  return [...byRunner.entries()].map(([runner, trials]) => {
    const passedTrials = trials.filter(
      (evaluation) => evaluation.verdict === "promote",
    ).length;

    return {
      runner,
      repeat,
      totalTrials: trials.length,
      passedTrials,
      passRate:
        trials.length === 0
          ? 0
          : passedTrials / trials.length,
    };
  });
}

export function formatBehaviorMatrix(verification) {
  const evaluations = verification.evaluations ?? [];
  if (!evaluations.length) return "No evaluations.";

  const grouped = groupByRunner(evaluations);
  const agentIds = [...grouped.keys()];
  const ids = new Set();

  for (const trials of grouped.values()) {
    for (const evaluation of trials) {
      for (const check of evaluation.baseline.checks) {
        ids.add(check.id ?? `${check.kind}:${check.target}`);
      }
      for (const check of evaluation.candidate.checks) {
        ids.add(check.id ?? `${check.kind}:${check.target}`);
      }
    }
  }

  const labels = [...ids].map((id) => {
    for (const trials of grouped.values()) {
      for (const evaluation of trials) {
        const check =
          evaluation.candidate.checks.find(
            (item) => (item.id ?? `${item.kind}:${item.target}`) === id,
          ) ??
          evaluation.baseline.checks.find(
            (item) => (item.id ?? `${item.kind}:${item.target}`) === id,
          );
        if (check?.label) return [id, check.label];
      }
    }
    return [id, id];
  });

  const labelWidth = Math.min(
    32,
    Math.max(12, ...labels.map(([, label]) => String(label).length)),
  );

  const agentNames = agentIds.map(displayAgent);
  const repeat = verification.repeat ?? 1;
  const agentWidths = agentNames.map((name) =>
    Math.max(repeat > 1 ? 18 : 16, name.length),
  );

  const lines = [
    `Cross-Agent Behavior Matrix · ${verification.patchId}`,
    "",
    `${"Check".padEnd(labelWidth)}  ${agentNames
      .map((name, i) => name.padEnd(agentWidths[i]))
      .join("  ")}`,
    `${"─".repeat(labelWidth)}  ${agentWidths
      .map((width) => "─".repeat(width))
      .join("  ")}`,
  ];

  for (const [id, label] of labels) {
    const cells = agentIds.map((agentId, index) => {
      const trials = grouped.get(agentId) ?? [];
      const before = trialPassCount(trials, "baseline", id);
      const after = trialPassCount(trials, "candidate", id);

      const text =
        trials.length > 1
          ? `${before}/${trials.length} → ${after}/${trials.length}`
          : `${mark(before === 1)} → ${mark(after === 1)}`;

      return text.padEnd(agentWidths[index]);
    });

    lines.push(
      `${truncate(label, labelWidth).padEnd(labelWidth)}  ${cells.join("  ")}`,
    );
  }

  lines.push("");

  for (const agentId of agentIds) {
    const trials = grouped.get(agentId) ?? [];
    const passed = trials.filter(
      (evaluation) => evaluation.verdict === "promote",
    ).length;

    lines.push(
      `${displayAgent(agentId).padEnd(12)} ${
        trials.length > 1
          ? `${passed}/${trials.length} trials`
          : String(trials[0]?.verdict ?? "unknown").toUpperCase()
      }`,
    );
  }

  lines.push("");

  const repeated = (verification.repeat ?? 1) > 1;

  lines.push(
    `Coverage: ${verification.coverage.passed}/${verification.coverage.total} agents ${
      repeated ? "stable" : "passed"
    }`,
  );

  if (repeated) {
    lines.push(
      `Trials: ${verification.coverage.passedTrials}/${verification.coverage.totalTrials} passed`,
    );
  }

  if (verification.coverage?.missingTargets?.length) {
    lines.push(
      `Missing targets: ${verification.coverage.missingTargets.map(displayAgent).join(", ")}`,
    );
  }

  lines.push(
    `Verdict: ${
      verification.verdict === "promote"
        ? repeated
          ? "STABLE ENOUGH TO PROMOTE"
          : "READY TO PROMOTE ACROSS VERIFIED AGENTS"
        : repeated
          ? "NOT STABLE"
          : "NOT READY"
    }`,
  );

  return lines.join("\n");
}

function groupByRunner(evaluations) {
  const map = new Map();
  for (const evaluation of evaluations) {
    const bucket = map.get(evaluation.runner) ?? [];
    bucket.push(evaluation);
    map.set(evaluation.runner, bucket);
  }
  return map;
}

function trialPassCount(trials, arm, id) {
  return trials.filter((evaluation) => {
    const checks = evaluation?.[arm]?.checks ?? [];
    const check = checks.find(
      (item) => (item.id ?? `${item.kind}:${item.target}`) === id,
    );
    return check?.passed === true;
  }).length;
}

function displayAgent(id) {
  return displayAgentName(id);
}

function mark(passed) {
  return passed ? "PASS" : "FAIL";
}

function truncate(value, width) {
  const text = String(value);
  return text.length <= width
    ? text
    : `${text.slice(0, Math.max(0, width - 1))}…`;
}
