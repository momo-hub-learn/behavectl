import fs from "node:fs/promises";
import path from "node:path";

import {
  runLiveValidation,
} from "./live.mjs";
import {
  replayTraceBundle,
} from "./protocol-replay.mjs";
import {
  verifyTraceManifest,
} from "./traces.mjs";
import {
  verifyProofIntegrity,
} from "./proof-integrity.mjs";
import {
  verifyProofBinding,
} from "./proof-binding.mjs";
import {
  formatBehaviorMatrix,
} from "./verify.mjs";
import {
  writeJsonAtomic,
} from "./fs.mjs";
import {
  buildReleaseArtifact,
  bindExistingReleaseArtifact,
  verifyReleaseArtifact,
} from "./release-artifact.mjs";
import { displayAgentName } from "../adapters/registry.mjs";

export async function runReleaseCandidate({
  repeat = 3,
  outputDir,
  onProgress = async () => {},
  runners,
  agents,
  doctorFn,
  mode = "real",
  liveRunner = runLiveValidation,
  artifactBuilder = buildReleaseArtifact,
  artifactBinder = bindExistingReleaseArtifact,
  artifactPath,
  packageRoot,
} = {}) {
  if (!Number.isInteger(repeat) || repeat < 3 || repeat > 10) {
    throw new Error(
      "Release Candidate validation requires --repeat between 3 and 10.",
    );
  }

  const live = await liveRunner({
    repeat,
    outputDir,
    onProgress,
    runners,
    agents,
    doctorFn,
    mode,
  });

  if (artifactPath) {
    await artifactBinder({
      bundleDir: live.outputDir,
      artifactPath,
    });
  } else {
    await artifactBuilder({
      bundleDir: live.outputDir,
      packageRoot,
    });
  }

  const assessment = await assessReleaseCandidate(
    live.outputDir,
  );

  await writeReleaseCandidateArtifacts(
    live.outputDir,
    assessment,
  );

  return {
    live,
    assessment,
  };
}

export async function assessReleaseCandidate(bundleDir) {
  const root = path.resolve(bundleDir);

  const result = await readJson(
    path.join(root, "result.json"),
  );
  const environment = await readJson(
    path.join(root, "environment.json"),
  );
  const proofDir = path.join(root, "proof");
  const traceDir = path.join(root, "traces");

  const proofIntegrity =
    await verifyProofIntegrity(proofDir);
  const proofBinding =
    await verifyProofBinding(proofDir);
  const traceIntegrity =
    await verifyTraceManifest(traceDir);
  const releaseArtifact =
    await verifyReleaseArtifact(root);

  let protocolReplay;
  try {
    protocolReplay =
      await replayTraceBundle(traceDir);
  } catch (error) {
    protocolReplay = {
      schema: "behavectl.protocol-bundle-replay.v1",
      traceDir,
      traceCount: 0,
      healthy: false,
      reports: [],
      error: String(error?.message ?? error),
    };
  }

  const verification = await readJson(
    path.join(proofDir, "verification.json"),
  );
  const proofManifest = await readJson(
    path.join(proofDir, "manifest.json"),
  );

  const agents = [
    ...new Set(
      verification?.coverage?.agents ??
      proofManifest?.runners ??
      [],
    ),
  ].sort();

  const repeat =
    Number(
      verification?.repeat ??
      result?.repeat ??
      0,
    );

  const totalTrials =
    Number(
      verification?.coverage?.totalTrials ??
      0,
    );
  const passedTrials =
    Number(
      verification?.coverage?.passedTrials ??
      0,
    );

  const requiredAgents = [
    ...new Set(
      verification?.coverage?.requiredTargets?.length
        ? verification.coverage.requiredTargets
        : agents,
    ),
  ].sort();

  const expectedTrials = repeat * requiredAgents.length;
  const expectedTraces =
    expectedTrials * 2;

  const patchLineageOk =
    Boolean(result?.patchId) &&
    result.patchId === verification?.patchId &&
    result.patchId === proofManifest?.patchId;

  const verificationLineageOk =
    Boolean(result?.verificationId) &&
    result.verificationId === verification?.id &&
    result.verificationId === proofManifest?.verificationId;

  const checks = [
    {
      id: "real-mode",
      label: "Real validation mode",
      passed: result?.mode === "real",
      detail:
        result?.mode === "real"
          ? "real"
          : `mode=${result?.mode ?? "missing"}`,
    },
    {
      id: "minimum-repetition",
      label: "At least 3 trials per agent",
      passed: repeat >= 3,
      detail: `${repeat} trial${repeat === 1 ? "" : "s"} per agent`,
    },
    {
      id: "certification-profile",
      label: "Certification profile fully verified",
      passed:
        requiredAgents.length > 0 &&
        requiredAgents.every((agent) => agents.includes(agent)) &&
        agents.every((agent) => requiredAgents.includes(agent)),
      detail:
        requiredAgents.length
          ? requiredAgents.map(displayAgentName).join(" + ")
          : "none declared",
    },
    {
      id: "all-trials-pass",
      label: "Every required trial passed",
      passed:
        totalTrials === expectedTrials &&
        passedTrials === totalTrials &&
        totalTrials > 0,
      detail:
        `${passedTrials}/${totalTrials} passed · expected ${expectedTrials}`,
    },
    {
      id: "verification-verdict",
      label: "Stability verdict is promotable",
      passed:
        verification?.verdict === "promote" &&
        result?.verdict === "promote",
      detail:
        `verification=${String(verification?.verdict ?? "missing").toUpperCase()} · live=${String(result?.verdict ?? "missing").toUpperCase()}`,
    },
    {
      id: "artifact-lineage",
      label: "Result, verification, and proof share one lineage",
      passed:
        patchLineageOk &&
        verificationLineageOk,
      detail:
        patchLineageOk && verificationLineageOk
          ? `${result.patchId} · ${result.verificationId}`
          : "Patch or verification identifiers disagree",
    },
    {
      id: "protocol-replay",
      label: "Raw protocol replay",
      passed: protocolReplay.healthy,
      detail:
        protocolReplay.healthy
          ? `${protocolReplay.traceCount} traces · healthy`
          : `${protocolReplay.traceCount} traces · ${
              protocolReplay.error
                ? `replay failed: ${protocolReplay.error}`
                : "drift detected"
            }`,
    },
    {
      id: "trace-coverage",
      label: "Every A/B arm has a retained raw trace",
      passed:
        protocolReplay.traceCount === expectedTraces,
      detail:
        `${protocolReplay.traceCount}/${expectedTraces} traces`,
    },
    {
      id: "trace-integrity",
      label: "Raw trace integrity",
      passed: traceIntegrity.valid,
      detail:
        `${traceIntegrity.checked} trace artifact${traceIntegrity.checked === 1 ? "" : "s"} checked`,
    },
    {
      id: "proof-integrity",
      label: "Behavior Proof integrity",
      passed: proofIntegrity.valid,
      detail:
        `${proofIntegrity.checked} proof artifact${proofIntegrity.checked === 1 ? "" : "s"} checked`,
    },
    {
      id: "proof-binding",
      label: "Behavior Proof semantic binding",
      passed: proofBinding.valid,
      detail:
        proofBinding.valid
          ? `sha256:${proofBinding.patchDigest.slice(0, 12)}…`
          : proofBinding.checks
              .filter((check) => !check.passed)
              .map((check) => check.label)
              .join("; "),
    },
    {
      id: "versions-recorded",
      label: "Certified Agent CLI versions recorded",
      passed:
        Boolean(environment?.versions?.git) &&
        requiredAgents.every((agent) => Boolean(versionForAgent(environment, agent))),
      detail:
        requiredAgents.length
          ? requiredAgents.map((agent) => `${displayAgentName(agent)}=${versionForAgent(environment, agent) ?? "missing"}`).join(" · ")
          : "no certification profile",
    },
    {
      id: "release-artifact",
      label: "Publish artifact is bound to this RC",
      passed: releaseArtifact.valid,
      detail: releaseArtifact.valid
        ? `${releaseArtifact.filename} · sha256:${releaseArtifact.sha256.slice(0, 12)}…`
        : releaseArtifact.reason,
    },
  ];

  const go =
    checks.every((check) => check.passed);

  return {
    schema: "behavectl.release-candidate.v2",
    createdAt: new Date().toISOString(),
    bundleDir: root,
    verdict: go ? "go" : "no-go",
    certificationProfile: requiredAgents,
    checks,
    result,
    environment,
    verification,
    proofManifest,
    protocolReplay: {
      healthy: protocolReplay.healthy,
      traceCount: protocolReplay.traceCount,
    },
    proofIntegrity: {
      valid: proofIntegrity.valid,
      checked: proofIntegrity.checked,
    },
    proofBinding: {
      valid: proofBinding.valid,
      patchId: proofBinding.patchId,
      patchDigest: proofBinding.patchDigest,
    },
    traceIntegrity: {
      valid: traceIntegrity.valid,
      checked: traceIntegrity.checked,
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

export function formatReleaseCandidate(
  assessment,
) {
  const lines = [
    "BEHAVECTL",
    "Release Candidate Gate",
    "",
  ];

  for (const check of assessment.checks) {
    lines.push(
      `${check.passed ? "✓" : "✗"} ${check.label.padEnd(36)} ${check.detail}`,
    );
  }

  lines.push("");
  lines.push(
    assessment.verdict === "go"
      ? "RELEASE CANDIDATE: GO"
      : "RELEASE CANDIDATE: NO-GO",
  );

  if (assessment.verdict === "go") {
    lines.push("");
    lines.push(
      `This bundle satisfies Behavectl's live-evidence gate for: ${assessment.certificationProfile.map(displayAgentName).join(" + ")}.`,
    );
  } else {
    lines.push("");
    lines.push(
      "Do not use this bundle as the public launch proof.",
    );
  }

  return lines.join("\n");
}

export async function writeReleaseCandidateArtifacts(
  bundleDir,
  assessment,
) {
  const root = path.resolve(bundleDir);

  await writeJsonAtomic(
    path.join(root, "release-candidate.json"),
    assessment,
  );

  await fs.writeFile(
    path.join(root, "RELEASE_CANDIDATE.md"),
    renderReleaseCandidateMarkdown(assessment),
    "utf8",
  );

  await fs.writeFile(
    path.join(root, "README_EVIDENCE.md"),
    renderReadmeEvidence(assessment),
    "utf8",
  );

  await fs.writeFile(
    path.join(root, "HERO_CAPTURE.txt"),
    renderHeroCapture(assessment),
    "utf8",
  );

  await fs.writeFile(
    path.join(root, "RELEASE_SEAL.md"),
    renderReleaseSeal(assessment),
    "utf8",
  );
}

export function renderReleaseCandidateMarkdown(
  assessment,
) {
  const rows = assessment.checks
    .map(
      (check) =>
        `| ${check.passed ? "✅" : "❌"} | ${escapePipe(check.label)} | ${escapePipe(check.detail)} |`,
    )
    .join("\n");

  return `# Behavectl Release Candidate

## ${
  assessment.verdict === "go"
    ? "✅ GO"
    : "❌ NO-GO"
}

| | Gate | Evidence |
|---|---|---|
${rows}

## Environment

- Git: \`${assessment.environment?.versions?.git ?? "missing"}\`
${(assessment.certificationProfile ?? []).map((agent) => `- ${displayAgentName(agent)}: \`${versionForAgent(assessment.environment, agent) ?? "missing"}\``).join("\n")}
- Node: \`${assessment.environment?.node ?? "missing"}\`
- Platform: \`${assessment.environment?.platform ?? "missing"} / ${assessment.environment?.arch ?? "missing"}\`

## Stability

\`\`\`text
${formatBehaviorMatrix(assessment.verification)}
\`\`\`

## Retained evidence

\`\`\`text
proof/
traces/
environment.json
result.json
release-candidate.json
release-artifact.json
${assessment.releaseArtifact?.filename ?? "behavectl-<version>.tgz"}
README_EVIDENCE.md
HERO_CAPTURE.txt
RELEASE_SEAL.md
\`\`\`

${
  assessment.verdict === "go"
    ? "This bundle satisfies the Behavectl v0.1 live-evidence gate."
    : "This bundle must not be used as the public launch proof."
}
`;
}

export function renderReadmeEvidence(
  assessment,
) {
  const matrix =
    formatBehaviorMatrix(
      assessment.verification,
    );

  return `## Real release validation

> Generated from a retained \`behavectl rc\` evidence bundle.

\`\`\`text
${matrix}
\`\`\`

Trust gates:

\`\`\`text
Protocol replay      ${
  assessment.protocolReplay.healthy ? "VALID" : "INVALID"
}
Trace integrity      ${
  assessment.traceIntegrity.valid ? "VALID" : "INVALID"
}
Proof integrity      ${
  assessment.proofIntegrity.valid ? "VALID" : "INVALID"
}
Proof binding        ${
  assessment.proofBinding.valid ? "VALID" : "INVALID"
}
Release Candidate    ${assessment.verdict.toUpperCase()}
Release artifact     ${assessment.releaseArtifact?.valid ? "BOUND" : "INVALID"}
\`\`\`

Release artifact:

\`\`\`text
${assessment.releaseArtifact?.filename ?? "missing"}
sha256:${assessment.releaseArtifact?.sha256 ?? "missing"}
\`\`\`

Environment:

\`\`\`text
${(assessment.certificationProfile ?? []).map((agent) => `${displayAgentName(agent).padEnd(16)} ${versionForAgent(assessment.environment, agent) ?? "missing"}`).join("\n")}
Git              ${assessment.environment?.versions?.git ?? "missing"}
\`\`\`
`;
}

export function renderHeroCapture(
  assessment,
) {
  return `${formatBehaviorMatrix(assessment.verification)}

Protocol replay     ${
  assessment.protocolReplay.healthy ? "VALID" : "INVALID"
}
Trace integrity     ${
  assessment.traceIntegrity.valid ? "VALID" : "INVALID"
}
Proof integrity     ${
  assessment.proofIntegrity.valid ? "VALID" : "INVALID"
}
Proof binding       ${
  assessment.proofBinding.valid ? "VALID" : "INVALID"
}

${assessment.verdict === "go" ? "RELEASE CANDIDATE: GO" : "RELEASE CANDIDATE: NO-GO"}
`;
}

export function renderReleaseSeal(assessment) {
  const artifact = assessment.releaseArtifact ?? {};
  return `# Behavectl Release Seal

## ${assessment.verdict === "go" ? "✅ RELEASE CANDIDATE: GO" : "❌ RELEASE CANDIDATE: NO-GO"}

This seal binds the retained live-behavior evidence to the exact npm artifact produced by the same Release Candidate run.

\`\`\`text
Package     ${artifact.package?.name ?? "missing"}@${artifact.package?.version ?? "missing"}
Artifact    ${artifact.filename ?? "missing"}
SHA-256     ${artifact.sha256 ?? "missing"}
Bytes       ${artifact.bytes ?? "missing"}
Proof       ${assessment.proofIntegrity?.valid ? "VALID" : "INVALID"}
Binding     ${assessment.proofBinding?.valid ? "VALID" : "INVALID"}
Traces      ${assessment.traceIntegrity?.valid ? "VALID" : "INVALID"}
Protocol    ${assessment.protocolReplay?.healthy ? "VALID" : "INVALID"}
RC verdict  ${assessment.verdict.toUpperCase()}
\`\`\`

> No artifact match, no release.
`;
}

function versionForAgent(environment, id) {
  return (
    environment?.versions?.agents?.[id] ??
    (id === "claude-code" ? environment?.versions?.claude : null) ??
    (id === "codex" ? environment?.versions?.codex : null) ??
    (id === "codebuddy" ? environment?.versions?.codebuddy : null)
  );
}

async function readJson(file) {
  return JSON.parse(
    await fs.readFile(file, "utf8"),
  );
}

function escapePipe(value) {
  return String(value ?? "").replaceAll("|", "\\|");
}
