import fs from "node:fs/promises";
import path from "node:path";

import { runLiveValidation } from "./live.mjs";
import { replayTraceBundle } from "./protocol-replay.mjs";
import { verifyTraceManifest } from "./traces.mjs";
import { verifyProofIntegrity, writeProofIntegrity } from "./proof-integrity.mjs";
import { verifyProofBinding } from "./proof-binding.mjs";
import { bindExistingReleaseArtifact, verifyReleaseArtifact } from "./release-artifact.mjs";
import { writeJsonAtomic, ensureDir } from "./fs.mjs";
import { makeId } from "./id.mjs";
import { formatBehaviorDiff } from "./eval/engine.mjs";
import { formatBehaviorMatrix } from "./verify.mjs";
import { renderProofMarkdown } from "./proof.mjs";
import {
  assessReleaseCandidate,
  writeReleaseCandidateArtifacts,
} from "./release-candidate.mjs";
import {
  canonicalAgentId,
  canonicalizeAgentList,
  agentDefinition,
  displayAgentName,
} from "../adapters/registry.mjs";

export async function runReleaseShard({
  agent,
  profile,
  repeat = 3,
  outputDir,
  artifactPath,
  onProgress = async () => {},
  doctorFn,
  runner,
  liveRunner = runLiveValidation,
} = {}) {
  const normalizedAgent = normalizeAgent(agent);
  const certificationProfile = normalizeProfile(profile?.length ? profile : [normalizedAgent]);
  if (!certificationProfile.includes(normalizedAgent)) {
    throw new Error(`RC shard agent ${normalizedAgent} is not part of the declared certification profile.`);
  }
  if (!Number.isInteger(repeat) || repeat < 3 || repeat > 10) {
    throw new Error("RC shard validation requires --repeat between 3 and 10.");
  }
  if (!artifactPath) {
    throw new Error("RC shard validation requires the exact candidate artifact via --artifact.");
  }

  const liveOptions = {
    repeat,
    outputDir,
    onProgress,
    doctorFn,
    mode: "real",
    agents: [normalizedAgent],
    targets: certificationProfile,
  };
  if (runner) liveOptions.runners = [runner];
  const live = await liveRunner(liveOptions);

  const pkg = await packageIdentity();
  await bindExistingReleaseArtifact({
    bundleDir: live.outputDir,
    artifactPath,
    expectedPackage: pkg,
  });

  const assessment = await assessReleaseShard(live.outputDir, {
    expectedAgent: normalizedAgent,
  });
  await writeReleaseShardArtifacts(live.outputDir, assessment);
  return { live, assessment };
}

export async function assessReleaseShard(bundleDir, { expectedAgent } = {}) {
  const root = path.resolve(bundleDir);
  const result = await readJson(path.join(root, "result.json"));
  const environment = await readJson(path.join(root, "environment.json"));
  const verification = await readJson(path.join(root, "proof", "verification.json"));
  const manifest = await readJson(path.join(root, "proof", "manifest.json"));

  const executedAgents = [...new Set(verification?.coverage?.agents ?? manifest?.runners ?? [])];
  const agent = normalizeAgent(expectedAgent ?? executedAgents[0]);
  const certificationProfile = normalizeProfile(
    verification?.coverage?.requiredTargets?.length
      ? verification.coverage.requiredTargets
      : manifest?.targets ?? [agent],
  );
  const repeat = Number(verification?.repeat ?? result?.repeat ?? 0);
  const evaluations = verification?.evaluations ?? [];
  const ownEvaluations = evaluations.filter((evaluation) => evaluation.runner === agent);

  const protocolReplay = await safeReplay(path.join(root, "traces"));
  const traceIntegrity = await verifyTraceManifest(path.join(root, "traces"));
  const proofIntegrity = await verifyProofIntegrity(path.join(root, "proof"));
  const releaseArtifact = await verifyReleaseArtifact(root);

  const patchDigest = verification?.patchDigest ?? manifest?.patchDigest ?? null;
  const specDigest = verification?.specDigest ?? manifest?.specDigest ?? null;
  const everyEvaluationBound =
    Boolean(patchDigest) &&
    ownEvaluations.length === repeat &&
    ownEvaluations.every((evaluation) => evaluation.patchDigest === patchDigest);

  const agentVersion = versionForAgent(environment, agent);
  const checks = [
    {
      id: "real-mode",
      label: "Real validation mode",
      passed: result?.mode === "real",
      detail: result?.mode ?? "missing",
    },
    {
      id: "single-agent",
      label: "Exactly one RC shard agent",
      passed: executedAgents.length === 1 && executedAgents[0] === agent,
      detail: executedAgents.length ? executedAgents.map(displayAgentName).join(" + ") : "none",
    },
    {
      id: "profile-membership",
      label: "Shard belongs to certification profile",
      passed: certificationProfile.includes(agent),
      detail: certificationProfile.map(displayAgentName).join(" + "),
    },
    {
      id: "minimum-repetition",
      label: "At least 3 trials",
      passed: repeat >= 3,
      detail: `${repeat} trials`,
    },
    {
      id: "all-trials-pass",
      label: "Every shard trial passed",
      passed:
        ownEvaluations.length === repeat &&
        ownEvaluations.every((evaluation) => evaluation.verdict === "promote"),
      detail: `${ownEvaluations.filter((evaluation) => evaluation.verdict === "promote").length}/${ownEvaluations.length} passed`,
    },
    {
      id: "evaluation-binding",
      label: "Every evaluation binds the same patch",
      passed: everyEvaluationBound,
      detail: patchDigest ? `sha256:${patchDigest.slice(0, 12)}…` : "missing patch digest",
    },
    {
      id: "protocol-replay",
      label: "Raw protocol replay",
      passed: protocolReplay.healthy,
      detail: `${protocolReplay.traceCount} traces`,
    },
    {
      id: "trace-coverage",
      label: "Every A/B arm has a retained trace",
      passed: protocolReplay.traceCount === repeat * 2,
      detail: `${protocolReplay.traceCount}/${repeat * 2} traces`,
    },
    {
      id: "trace-integrity",
      label: "Raw trace integrity",
      passed: traceIntegrity.valid,
      detail: `${traceIntegrity.checked} artifacts checked`,
    },
    {
      id: "proof-integrity",
      label: "Shard evidence integrity",
      passed: proofIntegrity.valid,
      detail: `${proofIntegrity.checked} artifacts checked`,
    },
    {
      id: "agent-version",
      label: "Agent CLI version recorded",
      passed: Boolean(agentVersion),
      detail: agentVersion ?? "missing",
    },
    {
      id: "release-artifact",
      label: "Exact candidate artifact bound",
      passed: releaseArtifact.valid,
      detail: releaseArtifact.valid
        ? `${releaseArtifact.filename} · sha256:${releaseArtifact.sha256.slice(0, 12)}…`
        : releaseArtifact.reason,
    },
  ];

  return {
    schema: "behavectl.release-shard.v2",
    createdAt: new Date().toISOString(),
    bundleDir: root,
    agent,
    certificationProfile,
    repeat,
    verdict: checks.every((check) => check.passed) ? "valid" : "invalid",
    checks,
    patchId: verification?.patchId ?? result?.patchId ?? null,
    patchDigest,
    specId: verification?.specId ?? null,
    specDigest,
    verificationId: verification?.id ?? null,
    environment,
    protocolReplay: {
      healthy: protocolReplay.healthy,
      traceCount: protocolReplay.traceCount,
    },
    traceIntegrity: {
      valid: traceIntegrity.valid,
      checked: traceIntegrity.checked,
    },
    proofIntegrity: {
      valid: proofIntegrity.valid,
      checked: proofIntegrity.checked,
    },
    releaseArtifact: {
      valid: releaseArtifact.valid,
      filename: releaseArtifact.filename ?? null,
      sha256: releaseArtifact.sha256 ?? null,
      bytes: releaseArtifact.bytes ?? null,
      package: releaseArtifact.package ?? null,
      reason: releaseArtifact.reason,
    },
  };
}

export function formatReleaseShard(assessment) {
  const lines = [
    "BEHAVECTL",
    `RC shard · ${displayAgentName(assessment.agent)}`,
    `Profile  · ${assessment.certificationProfile.map(displayAgentName).join(" + ")}`,
    "",
  ];
  for (const check of assessment.checks) {
    lines.push(`${check.passed ? "✓" : "✗"} ${check.label.padEnd(40)} ${check.detail}`);
  }
  lines.push("");
  lines.push(
    assessment.verdict === "valid"
      ? `RC SHARD: VALID · ${displayAgentName(assessment.agent)}`
      : `RC SHARD: INVALID · ${displayAgentName(assessment.agent)}`,
  );
  if (assessment.verdict === "valid") {
    lines.push("");
    lines.push("This shard proves one member of the declared certification profile.");
    lines.push("Collect the remaining profile shards, then run `behavectl rc merge`. ");
  }
  return lines.join("\n");
}

export async function mergeReleaseShards({ shardDirs, outputDir } = {}) {
  if (!Array.isArray(shardDirs) || shardDirs.length < 2) {
    throw new Error("RC merge requires at least two shard directories from one certification profile.");
  }
  if (!outputDir) throw new Error("RC merge requires --out <directory>.");

  const shards = [];
  for (const dir of shardDirs) {
    const assessment = await assessReleaseShard(dir);
    if (assessment.verdict !== "valid") throw new Error(`RC shard is invalid: ${dir}`);
    shards.push({ dir: path.resolve(dir), assessment });
  }

  shards.sort((a, b) => a.assessment.agent.localeCompare(b.assessment.agent));
  const first = shards[0];
  const profile = [...first.assessment.certificationProfile].sort();
  const profileKey = JSON.stringify(profile);

  for (const shard of shards.slice(1)) {
    assertSame("certification profile", profileKey, JSON.stringify([...shard.assessment.certificationProfile].sort()));
    assertSame("repeat", first.assessment.repeat, shard.assessment.repeat);
    assertSame("patch id", first.assessment.patchId, shard.assessment.patchId);
    assertSame("patch digest", first.assessment.patchDigest, shard.assessment.patchDigest);
    assertSame("spec id", first.assessment.specId, shard.assessment.specId);
    assertSame("spec digest", first.assessment.specDigest, shard.assessment.specDigest);
    assertSame("artifact SHA-256", first.assessment.releaseArtifact.sha256, shard.assessment.releaseArtifact.sha256);
    assertSame("artifact filename", first.assessment.releaseArtifact.filename, shard.assessment.releaseArtifact.filename);
    assertSame("package name", first.assessment.releaseArtifact.package?.name, shard.assessment.releaseArtifact.package?.name);
    assertSame("package version", first.assessment.releaseArtifact.package?.version, shard.assessment.releaseArtifact.package?.version);
  }

  const agents = shards.map((item) => item.assessment.agent);
  const uniqueAgents = [...new Set(agents)].sort();
  if (uniqueAgents.length !== agents.length) {
    throw new Error("RC merge received duplicate shards for the same agent.");
  }
  if (JSON.stringify(uniqueAgents) !== profileKey) {
    throw new Error(
      `RC merge profile coverage mismatch. Expected ${profile.map(displayAgentName).join(" + ")}; received ${uniqueAgents.map(displayAgentName).join(" + ")}.`,
    );
  }

  const root = path.resolve(outputDir);
  await ensureFreshOutputDir(root);
  await ensureDir(root);

  const patch = await readJson(path.join(first.dir, "proof", "patch.json"));
  const verifications = await Promise.all(
    shards.map((item) => readJson(path.join(item.dir, "proof", "verification.json"))),
  );
  const evaluations = verifications.flatMap((verification) => verification.evaluations ?? []);
  const repeat = first.assessment.repeat;
  const verification = buildMergedVerification({
    patch,
    firstVerification: verifications[0],
    evaluations,
    repeat,
    profile,
  });

  const proofDir = path.join(root, "proof");
  await writeMergedProof({ proofDir, patch, verification, profile });

  const traceDir = path.join(root, "traces");
  await mergeTraces({ shardDirs: shards.map((item) => item.dir), traceDir });

  const artifactName = first.assessment.releaseArtifact.filename;
  await fs.copyFile(path.join(first.dir, artifactName), path.join(root, artifactName));
  await fs.copyFile(path.join(first.dir, "release-artifact.json"), path.join(root, "release-artifact.json"));

  const environments = shards.map((item) => item.assessment.environment);
  const agentVersions = Object.fromEntries(
    shards.map((item) => [item.assessment.agent, versionForAgent(item.assessment.environment, item.assessment.agent)]),
  );
  const environment = {
    schema: "behavectl.distributed-live-environment.v2",
    mode: "distributed",
    createdAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    repeat,
    versions: {
      git: environments.map((env) => env?.versions?.git).filter(Boolean).join(" | ") || null,
      agents: agentVersions,
      claude: agentVersions["claude-code"] ?? null,
      codex: agentVersions.codex ?? null,
      codebuddy: agentVersions.codebuddy ?? null,
    },
    sources: shards.map((item) => ({
      agent: item.assessment.agent,
      shard: item.dir,
      environment: item.assessment.environment,
    })),
  };
  await writeJsonAtomic(path.join(root, "environment.json"), environment);

  const result = {
    schema: "behavectl.live-validation.v2",
    runId: makeId("merge"),
    mode: "real",
    execution: "distributed",
    startedAt: environments.map((env) => env?.startedAt).filter(Boolean).sort()[0] ?? null,
    finishedAt: new Date().toISOString(),
    repeat,
    patchId: patch.id,
    verificationId: verification.id,
    verdict: verification.verdict,
    coverage: verification.coverage,
    outputDir: root,
    proofDir: "proof",
  };
  await writeJsonAtomic(path.join(root, "result.json"), result);

  await writeJsonAtomic(path.join(root, "SHARD_SOURCES.json"), {
    schema: "behavectl.shard-sources.v2",
    createdAt: new Date().toISOString(),
    certificationProfile: profile,
    shards: shards.map((item) => ({
      agent: item.assessment.agent,
      patchDigest: item.assessment.patchDigest,
      specDigest: item.assessment.specDigest,
      artifactSha256: item.assessment.releaseArtifact.sha256,
      source: item.dir,
    })),
  });

  const assessment = await assessReleaseCandidate(root);
  await writeReleaseCandidateArtifacts(root, assessment);
  return { outputDir: root, assessment };
}

async function writeReleaseShardArtifacts(root, assessment) {
  await writeJsonAtomic(path.join(root, "RC_SHARD.json"), assessment);
  await fs.writeFile(
    path.join(root, "RC_SHARD.md"),
    `# Behavectl RC Shard\n\n## ${assessment.verdict === "valid" ? "✅ VALID" : "❌ INVALID"}\n\n- Agent: **${displayAgentName(assessment.agent)}**\n- Certification profile: **${assessment.certificationProfile.map(displayAgentName).join(" + ")}**\n- Trials: **${assessment.repeat}**\n- Patch: \`${assessment.patchId}\`\n- Patch digest: \`${assessment.patchDigest}\`\n- Spec digest: \`${assessment.specDigest}\`\n- Artifact: \`${assessment.releaseArtifact.filename}\`\n- Artifact SHA-256: \`${assessment.releaseArtifact.sha256}\`\n\nThis shard proves one member of a distributed certification profile. It cannot produce a GO verdict by itself unless the profile contains only this agent.\n`,
    "utf8",
  );
}

function buildMergedVerification({ patch, firstVerification, evaluations, repeat, profile }) {
  const agentStats = profile.map((runner) => {
    const trials = evaluations.filter((evaluation) => evaluation.runner === runner);
    const passedTrials = trials.filter((evaluation) => evaluation.verdict === "promote").length;
    return {
      runner,
      repeat,
      totalTrials: trials.length,
      passedTrials,
      passRate: trials.length ? passedTrials / trials.length : 0,
    };
  });
  const passing = agentStats
    .filter((agent) => agent.totalTrials === repeat && agent.passedTrials === repeat)
    .map((agent) => agent.runner);
  const requiredTargets = [...new Set(patch.targets ?? profile)].sort();
  const missingTargets = requiredTargets.filter((target) => !passing.includes(target));
  const passedTrials = evaluations.filter((evaluation) => evaluation.verdict === "promote").length;

  return {
    schema: "behavectl.cross-verification.v4",
    id: makeId("verify"),
    patchId: patch.id,
    patchVersion: patch.version ?? null,
    patchDigest: firstVerification.patchDigest,
    specId: firstVerification.specId,
    specDigest: firstVerification.specDigest,
    createdAt: new Date().toISOString(),
    repeat,
    execution: "distributed",
    evaluations,
    agents: agentStats,
    coverage: {
      agents: profile,
      passing,
      requiredTargets,
      missingTargets,
      total: profile.length,
      passed: passing.length,
      totalTrials: evaluations.length,
      passedTrials,
    },
    verdict:
      missingTargets.length === 0 &&
      evaluations.length === repeat * profile.length &&
      passedTrials === evaluations.length
        ? "promote"
        : "mixed",
  };
}

async function writeMergedProof({ proofDir, patch, verification, profile }) {
  await ensureDir(path.join(proofDir, "evaluations"));
  await ensureDir(path.join(proofDir, "diffs"));

  const manifest = {
    schema: "behavectl.behavior-proof.v4",
    proofId: makeId("proof"),
    patchId: patch.id,
    patchVersion: patch.version ?? null,
    patchDigest: verification.patchDigest,
    specDigest: verification.specDigest,
    verificationId: verification.id,
    repeat: verification.repeat,
    runners: profile,
    verdict: verification.verdict,
    createdAt: new Date().toISOString(),
    source: patch.source,
    scope: patch.scope,
    risk: patch.risk,
    targets: patch.targets,
    coverage: verification.coverage,
    execution: "distributed",
    files: {
      patch: "patch.json",
      verification: "verification.json",
      matrix: "behavior-matrix.txt",
      markdown: "PROOF.md",
      evaluations: "evaluations/",
      diffs: "diffs/",
      integrity: "checksums.json",
    },
    integrity: {
      schema: "behavectl.proof-integrity.v1",
      algorithm: "sha256",
      file: "checksums.json",
      note: "Tamper-evidence only; author identity is not implied.",
    },
  };

  await writeJsonAtomic(path.join(proofDir, "manifest.json"), manifest);
  await writeJsonAtomic(path.join(proofDir, "patch.json"), patch);
  await writeJsonAtomic(path.join(proofDir, "verification.json"), verification);

  for (const evaluation of verification.evaluations) {
    const trial = evaluation.trial ?? 1;
    const slug = `${evaluation.runner}-trial-${String(trial).padStart(2, "0")}`;
    await writeJsonAtomic(path.join(proofDir, "evaluations", `${slug}.json`), evaluation);
    await fs.writeFile(
      path.join(proofDir, "diffs", `${slug}.txt`),
      `${formatBehaviorDiff(evaluation)}\n`,
      "utf8",
    );
  }

  await fs.writeFile(path.join(proofDir, "behavior-matrix.txt"), `${formatBehaviorMatrix(verification)}\n`, "utf8");
  await fs.writeFile(
    path.join(proofDir, "PROOF.md"),
    renderProofMarkdown({ patch, evaluations: verification.evaluations, verification }),
    "utf8",
  );
  await writeProofIntegrity(proofDir);

  const binding = await verifyProofBinding(proofDir);
  if (!binding.valid) throw new Error("Merged Behavior Proof failed semantic binding verification.");
}

async function mergeTraces({ shardDirs, traceDir }) {
  await ensureDir(traceDir);
  const records = [];

  for (const dir of shardDirs) {
    const sourceRoot = path.join(dir, "traces");
    const manifest = await readJson(path.join(sourceRoot, "trace-manifest.json"));
    for (const trace of manifest.traces ?? []) {
      records.push(trace);
      for (const rel of [trace.stdout, trace.stderr].filter(Boolean)) {
        const source = path.join(sourceRoot, rel);
        const target = path.join(traceDir, rel);
        await ensureDir(path.dirname(target));
        await fs.copyFile(source, target);
      }
    }
  }

  records.sort((a, b) =>
    String(a.runner).localeCompare(String(b.runner)) ||
    Number(a.trial) - Number(b.trial) ||
    String(a.arm).localeCompare(String(b.arm)),
  );

  await writeJsonAtomic(path.join(traceDir, "trace-manifest.json"), {
    schema: "behavectl.trace-manifest.v1",
    createdAt: new Date().toISOString(),
    traces: records,
  });

  const replay = await replayTraceBundle(traceDir);
  await writeJsonAtomic(path.join(traceDir, "protocol-report.json"), {
    schema: "behavectl.protocol-report.v2",
    createdAt: new Date().toISOString(),
    healthy: replay.healthy,
    traces: replay.reports.map((item) => ({
      runner: item.runner,
      arm: item.arm,
      trial: item.trial,
      source: item.file,
      eventCount: item.report.eventCount,
      commands: item.report.commands,
      eventTypes: item.report.eventTypes,
      itemTypes: item.report.itemTypes ?? {},
      terminalEventPresent: item.report.terminalEventPresent,
      usagePresent: item.report.usagePresent,
      protocolHealthy: item.report.protocolHealthy,
      warnings: item.report.warnings,
    })),
  });

  const integrity = await verifyTraceManifest(traceDir);
  if (!integrity.valid || !replay.healthy) {
    throw new Error("Merged raw traces failed integrity or protocol replay.");
  }
}

function normalizeAgent(agent) {
  const id = canonicalAgentId(agent);
  const adapter = id ? agentDefinition(id) : null;
  if (!adapter) throw new Error(`RC shard agent is not registered: ${agent}`);
  if (!adapter.capabilities.includes("evaluate") || !adapter.capabilities.includes("replay")) {
    throw new Error(`RC shard agent ${id} must support evaluate + replay capabilities.`);
  }
  return id;
}

function normalizeProfile(profile) {
  const resolved = canonicalizeAgentList(profile ?? []);
  if (resolved.unknown.length) {
    throw new Error(`Unknown certification profile adapters: ${resolved.unknown.join(", ")}.`);
  }
  if (!resolved.agents.length) throw new Error("Certification profile cannot be empty.");
  for (const id of resolved.agents) normalizeAgent(id);
  return [...resolved.agents].sort();
}

async function packageIdentity() {
  const pkg = JSON.parse(await fs.readFile(new URL("../../package.json", import.meta.url), "utf8"));
  return { name: pkg.name, version: pkg.version };
}

async function safeReplay(traceDir) {
  try {
    return await replayTraceBundle(traceDir);
  } catch (error) {
    return {
      schema: "behavectl.protocol-bundle-replay.v2",
      traceDir,
      traceCount: 0,
      healthy: false,
      reports: [],
      error: String(error?.message ?? error),
    };
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function versionForAgent(environment, id) {
  return (
    environment?.versions?.agents?.[id] ??
    (id === "claude-code" ? environment?.versions?.claude : null) ??
    (id === "codex" ? environment?.versions?.codex : null) ??
    (id === "codebuddy" ? environment?.versions?.codebuddy : null)
  );
}

function assertSame(label, left, right) {
  if (left !== right) {
    throw new Error(`RC shard mismatch: ${label}. Left=${String(left)} Right=${String(right)}`);
  }
}

async function ensureFreshOutputDir(dir) {
  try {
    const entries = await fs.readdir(dir);
    if (entries.length > 0) {
      throw new Error(`RC merge output directory already exists and is not empty: ${dir}`);
    }
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
}
