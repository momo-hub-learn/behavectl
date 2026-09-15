import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { doctor } from "./doctor.mjs";
import { createKillerDemoRepo, KILLER_DEMO_PATCH_ID } from "./demo-repo.mjs";
import { LocalStore } from "./store.mjs";
import {
  canonicalizeAgentList,
  createAgentRunner,
  displayAgentName,
} from "../adapters/registry.mjs";
import { verifyAcrossAgents, formatBehaviorMatrix } from "./verify.mjs";
import { createBehaviorProof } from "./proof.mjs";
import { verifyProofIntegrity } from "./proof-integrity.mjs";
import { makeId } from "./id.mjs";
import { ensureDir, writeJsonAtomic } from "./fs.mjs";
import { createTraceRecorder, verifyTraceManifest } from "./traces.mjs";

export async function livePreflight({
  repeat = 3,
  doctorFn = doctor,
  agents = ["claude-code", "codex"],
} = {}) {
  const health = await doctorFn();
  const requestedAgents = normalizeAgents(agents);

  const missing = [];
  if (!health.git?.installed) missing.push("git");
  for (const agent of requestedAgents) {
    if (!healthForAgent(health, agent)?.installed) missing.push(agent);
  }

  return {
    schema: "behavectl.live-preflight.v2",
    repeat,
    agents: requestedAgents,
    health,
    missing,
    ready: missing.length === 0,
    plannedEvaluations: requestedAgents.length * repeat,
    plannedAgentInvocations: requestedAgents.length * repeat * 2,
  };
}

export function formatLivePreflight(preflight) {
  const agents = preflight.agents ?? [];
  const lines = [
    "BEHAVECTL",
    "Live validation",
    "",
    "Preflight",
    row("Git", preflight.health.git),
  ];

  for (const agent of agents) {
    lines.push(row(displayAgentName(agent), healthForAgent(preflight.health, agent)));
  }

  lines.push(
    "",
    `Plan       ${preflight.repeat} trial${preflight.repeat === 1 ? "" : "s"} × ${agents.length} agent${agents.length === 1 ? "" : "s"}`,
    `A/B runs   ${preflight.plannedEvaluations}`,
    `Agent jobs ${preflight.plannedAgentInvocations}`,
  );

  if (!preflight.ready) {
    lines.push("");
    lines.push(`Blocked    missing: ${preflight.missing.join(", ")}`);
  } else {
    lines.push("");
    lines.push("Ready      binaries found");
    lines.push("Note       authentication is confirmed by the first real evaluation.");
  }

  return lines.join("\n");
}

export async function runLiveValidation({
  repeat = 3,
  outputDir,
  onProgress = async () => {},
  runners,
  doctorFn = doctor,
  mode = "real",
  agents = runners?.map((runner) => runner.id) ?? ["claude-code", "codex"],
  targets = agents,
} = {}) {
  const requestedAgents = normalizeAgents(agents);
  const declaredTargets = normalizeAgents(targets);
  const preflight = await livePreflight({ repeat, doctorFn, agents: requestedAgents });

  if (mode === "real" && !preflight.ready) {
    const error = new Error(
      `Live validation is not ready. Missing: ${preflight.missing.join(", ")}.`,
    );
    error.code = "BCTL_LIVE_PREFLIGHT_FAILED";
    error.preflight = preflight;
    throw error;
  }

  const runId = makeId("live");
  const startedAt = new Date().toISOString();
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "behavectl-live-"),
  );
  const demoRoot = path.join(tempRoot, "repo");

  const finalDir = path.resolve(
    outputDir ??
      path.join(
        process.cwd(),
        `behavectl-live-${timestampSlug(new Date())}`,
      ),
  );

  await ensureFreshOutputDir(finalDir);
  await ensureDir(finalDir);

  const traceDir = path.join(finalDir, "traces");
  const traceRecorder = createTraceRecorder(traceDir);

  const environment = {
    schema: "behavectl.live-environment.v1",
    runId,
    mode,
    startedAt,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    versions: {
      git: preflight.health.git?.version ?? null,
      agents: Object.fromEntries(
        requestedAgents.map((agent) => [
          agent,
          healthForAgent(preflight.health, agent)?.version ?? null,
        ]),
      ),
      // Legacy fields stay during alpha so older proof readers keep working.
      claude: healthForAgent(preflight.health, "claude-code")?.version ?? null,
      codex: healthForAgent(preflight.health, "codex")?.version ?? null,
      codebuddy: healthForAgent(preflight.health, "codebuddy")?.version ?? null,
    },
    repeat,
    agents: requestedAgents,
    targets: declaredTargets,
    plannedAgentInvocations: preflight.plannedAgentInvocations,
  };

  await writeJsonAtomic(
    path.join(finalDir, "environment.json"),
    environment,
  );
  await writeJsonAtomic(
    path.join(finalDir, "preflight.json"),
    preflight,
  );

  try {
    await onProgress({ phase: "challenge", state: "running" });
    const demo = await createKillerDemoRepo(demoRoot, { targets: declaredTargets });
    await onProgress({ phase: "challenge", state: "done" });

    const store = new LocalStore(demoRoot);
    const patch = await store.patch(KILLER_DEMO_PATCH_ID);
    const spec = JSON.parse(
      await fs.readFile(
        path.join(
          demoRoot,
          ".behavectl",
          "specs",
          `${KILLER_DEMO_PATCH_ID}.json`,
        ),
        "utf8",
      ),
    );

    const traceSink = async (trace) => {
      await traceRecorder.record(trace);
    };

    const realRunners =
      runners ??
      requestedAgents.map((agent) => createAgentRunner(agent, { traceSink }));

    const verification = await verifyAcrossAgents({
      repoRoot: demoRoot,
      patch,
      spec,
      runners: realRunners,
      repeat,
      onProgress: async (event) => {
        await onProgress({
          phase: "verification",
          state: "running",
          ...event,
        });
      },
    });

    const traceSummary = await traceRecorder.finalize();

    if (
      traceRecorder.records().length > 0 &&
      !traceSummary.protocolReport.healthy
    ) {
      const error = new Error(
        "Raw agent traces were captured, but the protocol replay contract is unhealthy. Inspect traces/protocol-report.json before trusting this run.",
      );
      error.code = "BCTL_PROTOCOL_DRIFT";
      throw error;
    }

    const traceIntegrity =
      traceRecorder.records().length > 0
        ? await verifyTraceManifest(traceDir)
        : null;

    if (traceIntegrity && !traceIntegrity.valid) {
      const error = new Error(
        "Raw agent trace integrity verification failed.",
      );
      error.code = "BCTL_TRACE_INTEGRITY_FAILED";
      throw error;
    }

    for (const evaluation of verification.evaluations) {
      await store.putEvaluation(evaluation);
    }
    await store.putVerification(verification);

    await onProgress({
      phase: "verification",
      state: "done",
      verification,
    });

    const proof = await createBehaviorProof(
      store,
      KILLER_DEMO_PATCH_ID,
    );

    const proofTarget = path.join(finalDir, "proof");
    await fs.cp(proof.dir, proofTarget, {
      recursive: true,
    });

    const proofIntegrity = await verifyProofIntegrity(proofTarget);
    if (!proofIntegrity.valid) {
      const error = new Error(
        "Generated live Behavior Proof failed its own integrity check.",
      );
      error.code = "BCTL_LIVE_PROOF_INTEGRITY_FAILED";
      throw error;
    }

    await fs.cp(
      path.join(demoRoot, "config"),
      path.join(finalDir, "challenge", "config"),
      { recursive: true },
    );
    await fs.cp(
      path.join(demoRoot, "dist"),
      path.join(finalDir, "challenge", "dist"),
      { recursive: true },
    );
    await fs.cp(
      path.join(demoRoot, "scripts"),
      path.join(finalDir, "challenge", "scripts"),
      { recursive: true },
    );

    const finishedAt = new Date().toISOString();
    const result = {
      schema: "behavectl.live-validation.v1",
      runId,
      mode,
      startedAt,
      finishedAt,
      repeat,
      patchId: KILLER_DEMO_PATCH_ID,
      verificationId: verification.id,
      verdict: verification.verdict,
      coverage: verification.coverage,
      outputDir: finalDir,
      proofDir: "proof",
      proofIntegrity: {
        algorithm: proofIntegrity.algorithm,
        checked: proofIntegrity.checked,
        valid: proofIntegrity.valid,
      },
      protocolReplay: {
        traces: traceRecorder.records().length,
        healthy: traceSummary.protocolReport.healthy,
        traceIntegrityValid:
          traceIntegrity?.valid ?? null,
      },
    };

    await writeJsonAtomic(
      path.join(finalDir, "result.json"),
      result,
    );

    await fs.writeFile(
      path.join(finalDir, "LIVE_VALIDATION.md"),
      renderLiveValidationMarkdown({
        result,
        verification,
        preflight,
      }),
      "utf8",
    );

    await onProgress({
      phase: "bundle",
      state: "done",
      result,
    });

    return {
      result,
      verification,
      outputDir: finalDir,
      proofDir: proofTarget,
    };
  } catch (error) {
    const failure = {
      schema: "behavectl.live-failure.v1",
      runId,
      mode,
      startedAt,
      failedAt: new Date().toISOString(),
      code: error?.code ?? "BCTL_LIVE_FAILED",
      message: String(error?.message ?? error),
      runner: error?.runner ?? null,
      exitCode: error?.exitCode ?? null,
    };

    await writeJsonAtomic(
      path.join(finalDir, "failure.json"),
      failure,
    );

    await fs.writeFile(
      path.join(finalDir, "LIVE_VALIDATION.md"),
      renderFailureMarkdown(failure, preflight),
      "utf8",
    );

    error.liveBundle = finalDir;
    throw error;
  } finally {
    await fs.rm(tempRoot, {
      recursive: true,
      force: true,
    });
  }
}

export function renderLiveValidationMarkdown({
  result,
  verification,
  preflight,
}) {
  return `# Behavectl Live Validation

> **Run:** \`${result.runId}\`  
> **Verdict:** **${String(result.verdict).toUpperCase()}**  
> **Trials:** ${verification.coverage.passedTrials}/${verification.coverage.totalTrials} passed  
> **Agents:** ${verification.coverage.passed}/${verification.coverage.total} stable

## Environment

- Node: \`${preflight.health.node?.version ?? "unknown"}\`
- Git: \`${preflight.health.git?.version ?? "unknown"}\`
${preflight.agents.map((agent) => {
  const detected = healthForAgent(preflight.health, agent);
  return `- ${displayAgentName(agent)}: \`${detected?.version ?? "unknown"}\``;
}).join("\n")}

## Behavior Stability Matrix

\`\`\`text
${formatBehaviorMatrix(verification)}
\`\`\`

## Artifacts

- \`proof/PROOF.md\`
- \`proof/behavior-matrix.txt\`
- \`proof/evaluations/\`
- \`proof/diffs/\`
- \`environment.json\`
- \`result.json\`
- \`traces/trace-manifest.json\`
- \`traces/protocol-report.json\`
- \`traces/<agent>/trial-XX-{baseline,candidate}.jsonl\`

Raw JSONL traces are captured only by the synthetic \`behavectl live\` validation
flow. Normal project evaluations do not persist raw model output by default.

The proof bundle is SHA-256 integrity checked before this report is written.
Hashes detect artifact modification but do not prove author identity.

The challenge repository is synthetic and contains no user project data.
`;
}

function renderFailureMarkdown(failure, preflight) {
  return `# Behavectl Live Validation — FAILED

> **Run:** \`${failure.runId}\`  
> **Code:** \`${failure.code}\`

## Failure

\`\`\`text
${failure.message}
\`\`\`

## Environment

- Git: \`${preflight.health.git?.version ?? "not found"}\`
${preflight.agents.map((agent) => {
  const detected = healthForAgent(preflight.health, agent);
  return `- ${displayAgentName(agent)}: \`${detected?.version ?? "not found"}\``;
}).join("\n")}

This bundle was intentionally retained so the failure can be diagnosed.
No behavior verdict should be inferred from an infrastructure failure.
`;
}

async function ensureFreshOutputDir(dir) {
  try {
    const entries = await fs.readdir(dir);
    if (entries.length > 0) {
      throw new Error(
        `Live output directory already exists and is not empty: ${dir}`,
      );
    }
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
}

function healthForAgent(health, id) {
  const fromRegistry = health?.agents?.find((item) => item.id === id);
  if (fromRegistry) return fromRegistry;
  if (id === "claude-code") return health?.claude;
  if (id === "codex") return health?.codex;
  if (id === "codebuddy") return health?.codebuddy;
  return null;
}

function row(name, value) {
  const mark = value?.installed ? "✓" : "○";
  const version = value?.installed
    ? value.version ?? "found"
    : "not found";
  return `${mark} ${name.padEnd(12)} ${version}`;
}

function timestampSlug(date) {
  return date
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "Z");
}


function normalizeAgents(agents) {
  const resolved = canonicalizeAgentList(agents ?? []);
  if (resolved.unknown.length) {
    throw new Error(
      `Unknown live-validation adapters: ${resolved.unknown.join(", ")}. Load them before starting live validation.`,
    );
  }
  if (!resolved.agents.length) {
    throw new Error("Live validation requires at least one declared Agent Adapter.");
  }
  return resolved.agents;
}
