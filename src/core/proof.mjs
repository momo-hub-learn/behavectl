import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./fs.mjs";
import { makeId } from "./id.mjs";
import { formatBehaviorDiff } from "./eval/engine.mjs";
import { formatBehaviorMatrix } from "./verify.mjs";
import { writeProofIntegrity } from "./proof-integrity.mjs";
import { behaviorPatchDigest } from "./fingerprint.mjs";

export async function latestRealEvaluations(store, patchId) {
  const evaluations = await store.evaluationsForPatch(patchId);

  const latestByRunner = new Map();

  for (const evaluation of evaluations
    .filter((item) => item.runner !== "fixture")
    .sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)),
    )) {
    if (!latestByRunner.has(evaluation.runner)) {
      latestByRunner.set(evaluation.runner, evaluation);
    }
  }

  return [...latestByRunner.values()];
}

export async function latestRealVerification(store, patchId) {
  const verifications = await store.verificationsForPatch(patchId);

  return verifications
    .filter(
      (verification) =>
        Array.isArray(verification.evaluations) &&
        verification.evaluations.length > 0 &&
        verification.evaluations.every(
          (evaluation) => evaluation.runner !== "fixture",
        ),
    )
    .sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)),
    )[0] ?? null;
}

export async function latestRealEvaluation(store, patchId) {
  return (await latestRealEvaluations(store, patchId))[0] ?? null;
}

export async function createBehaviorProof(store, patchId) {
  const patch = await store.patch(patchId);
  if (!patch) throw new Error(`Patch not found: ${patchId}`);

  const currentPatchDigest = behaviorPatchDigest(patch);
  let verification = await latestRealVerification(store, patchId);

  if (!verification) {
    const evaluations = await latestRealEvaluations(store, patchId);

    if (!evaluations.length) {
      throw new Error(
        `Patch ${patchId} has no real Behavior Diff to prove. Run a real \`behavectl test\` or \`behavectl verify\` first.`,
      );
    }

    verification = syntheticVerification(patch, evaluations);
  }

  if (!verification.patchDigest) {
    const error = new Error(
      `Patch ${patchId} was evaluated with an older unbound format. Re-run \`behavectl verify ${patchId}\` before creating a Behavior Proof.`,
    );
    error.code = "BCTL_PROOF_UNBOUND_VERIFICATION";
    throw error;
  }

  if (verification.patchDigest !== currentPatchDigest) {
    const error = new Error(
      `Patch ${patchId} changed after verification. Re-run \`behavectl verify ${patchId}\` before creating a Behavior Proof.`,
    );
    error.code = "BCTL_PROOF_STALE_VERIFICATION";
    throw error;
  }

  const evaluations = verification.evaluations;

  for (const evaluation of evaluations) {
    if (!evaluation.patchDigest) {
      const error = new Error(
        `Evaluation ${evaluation.id} is not bound to a Behavior Patch digest. Re-run verification.`,
      );
      error.code = "BCTL_PROOF_UNBOUND_EVALUATION";
      throw error;
    }

    if (evaluation.patchDigest !== currentPatchDigest) {
      const error = new Error(
        `Evaluation ${evaluation.id} does not match the current Behavior Patch.`,
      );
      error.code = "BCTL_PROOF_STALE_EVALUATION";
      throw error;
    }
  }

  const proofId = makeId("proof");
  const proofDir = path.join(store.root, "proofs", proofId);
  const evalDir = path.join(proofDir, "evaluations");
  const diffDir = path.join(proofDir, "diffs");

  await ensureDir(evalDir);
  await ensureDir(diffDir);

  const runners = [...new Set(
    evaluations.map((evaluation) => evaluation.runner),
  )];

  const manifest = {
    schema: "behavectl.behavior-proof.v4",
    proofId,
    patchId,
    patchVersion: patch.version ?? null,
    patchDigest: currentPatchDigest,
    specDigest: verification.specDigest ?? null,
    verificationId: verification.id ?? null,
    repeat: verification.repeat ?? 1,
    runners,
    verdict: verification.verdict,
    createdAt: new Date().toISOString(),
    source: patch.source,
    scope: patch.scope,
    risk: patch.risk,
    targets: patch.targets,
    coverage: verification.coverage,
    files: {
      patch: "patch.json",
      verification: "verification.json",
      matrix:
        runners.length > 1 || (verification.repeat ?? 1) > 1
          ? "behavior-matrix.txt"
          : null,
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
  await writeJsonAtomic(
    path.join(proofDir, "verification.json"),
    verification,
  );

  for (let i = 0; i < evaluations.length; i++) {
    const evaluation = evaluations[i];
    const slug = evaluationSlug(evaluation, i);

    await writeJsonAtomic(
      path.join(evalDir, `${slug}.json`),
      evaluation,
    );

    await fs.writeFile(
      path.join(diffDir, `${slug}.txt`),
      formatBehaviorDiff(evaluation) + "\n",
      "utf8",
    );
  }

  if (manifest.files.matrix) {
    await fs.writeFile(
      path.join(proofDir, "behavior-matrix.txt"),
      formatBehaviorMatrix(verification) + "\n",
      "utf8",
    );
  }

  const markdown = renderProofMarkdown({
    patch,
    evaluations,
    verification,
  });

  await fs.writeFile(
    path.join(proofDir, "PROOF.md"),
    markdown,
    "utf8",
  );

  const integrity = await writeProofIntegrity(proofDir);

  return {
    dir: proofDir,
    manifest,
    markdown,
    verification,
    integrity,
  };
}

function syntheticVerification(patch, evaluations) {
  const currentPatchDigest = behaviorPatchDigest(patch);

  for (const evaluation of evaluations) {
    if (
      !evaluation.patchDigest ||
      evaluation.patchDigest !== currentPatchDigest
    ) {
      const error = new Error(
        `Stored evaluation ${evaluation.id} is not bound to the current Behavior Patch. Re-run verification.`,
      );
      error.code = "BCTL_PROOF_STALE_EVALUATION";
      throw error;
    }
  }

  const runners = [...new Set(
    evaluations.map((evaluation) => evaluation.runner),
  )];

  const passing = runners.filter((runner) =>
    evaluations
      .filter((evaluation) => evaluation.runner === runner)
      .every((evaluation) => evaluation.verdict === "promote"),
  );

  const requiredTargets = [...new Set(patch.targets ?? [])].sort();
  const missingTargets = requiredTargets.filter(
    (target) => !runners.includes(target),
  );

  const passedTrials = evaluations.filter(
    (evaluation) => evaluation.verdict === "promote",
  ).length;

  return {
    schema: "behavectl.cross-verification.v3",
    id: null,
    patchId: patch.id,
    patchVersion: patch.version ?? null,
    patchDigest: currentPatchDigest,
    specId: evaluations[0]?.specId,
    specDigest: evaluations[0]?.specDigest ?? null,
    createdAt: new Date().toISOString(),
    repeat: 1,
    evaluations,
    agents: runners.map((runner) => {
      const trials = evaluations.filter(
        (evaluation) => evaluation.runner === runner,
      );
      const passed = trials.filter(
        (evaluation) => evaluation.verdict === "promote",
      ).length;
      return {
        runner,
        repeat: 1,
        totalTrials: trials.length,
        passedTrials: passed,
        passRate: trials.length ? passed / trials.length : 0,
      };
    }),
    coverage: {
      agents: runners,
      passing,
      requiredTargets,
      missingTargets,
      total: runners.length,
      passed: passing.length,
      totalTrials: evaluations.length,
      passedTrials,
    },
    verdict:
      runners.length > 0 &&
      passing.length === runners.length &&
      missingTargets.length === 0
        ? "promote"
        : "mixed",
  };
}

export function renderProofMarkdown({
  patch,
  evaluations,
  verification,
}) {
  const evidence = patch.evidence?.length
    ? patch.evidence.map(renderEvidence).join("\n")
    : "- No evidence attached.";

  const runners = [...new Set(
    evaluations.map((evaluation) => evaluation.runner),
  )];

  const showMatrix =
    runners.length > 1 || (verification.repeat ?? 1) > 1;

  const behaviorSection = showMatrix
    ? `## Behavior Stability Matrix

\`\`\`text
${formatBehaviorMatrix(verification)}
\`\`\`

${evaluations
  .map(
    (evaluation) => `### ${displayAgent(evaluation.runner)} · Trial ${evaluation.trial ?? 1}/${evaluation.repeat ?? verification.repeat ?? 1}

\`\`\`text
${formatBehaviorDiff(evaluation)}
\`\`\``,
  )
  .join("\n\n")}`
    : `## Behavior Diff

\`\`\`text
${formatBehaviorDiff(evaluations[0])}
\`\`\``;

  const trialLine =
    (verification.repeat ?? 1) > 1
      ? `> **Trials:** **${verification.coverage.passedTrials}/${verification.coverage.totalTrials} passed**  \n`
      : "";

  return `# Behavectl Behavior Proof

> **Patch:** \`${patch.id}\`  
> **Agents:** ${runners.map((runner) => `\`${displayAgent(runner)}\``).join(", ")}  
> **Coverage:** **${verification.coverage.passed}/${verification.coverage.total} agents stable**  
${trialLine}> **Verdict:** **${String(verification.verdict).toUpperCase()}**  
> **Created:** ${verification.createdAt}

## Proposed behavior

${patch.behavior.statement}

## Scope

- Scope: \`${patch.scope?.kind ?? "unknown"}\`
- Risk: \`${patch.risk ?? "unknown"}\`
- Targets: ${(patch.targets ?? []).map((x) => `\`${x}\``).join(", ") || "none"}

## Evidence

${evidence}

${behaviorSection}

## Provenance

This proof is cryptographically bound to the exact Behavior Patch content
through its SHA-256 patch digest. Editing the patch after evaluation requires a
new Verification Run before another proof can be created.

This proof was generated from persisted Behavectl Behavior Patches and
real-agent A/B evaluation results. Fixture evaluations are never eligible for
proof generation or promotion.

Repeated verification preserves every trial rather than cherry-picking a
single successful run.

## Integrity

Every proof artifact is covered by SHA-256 digests in \`checksums.json\`.
Verify the directory before trusting a copied or downloaded proof:

\`\`\`bash
behavectl proof verify .
\`\`\`

This detects modification, deletion, or insertion of proof artifacts. It does
**not** prove who created the proof; signed attestation is a separate future
layer.

Rollback remains available after promotion:

\`\`\`bash
behavectl rollback ${patch.id}
\`\`\`
`;
}

function evaluationSlug(evaluation, index) {
  const runner = runnerSlug(evaluation.runner);
  const trial = evaluation.trial ?? index + 1;
  return `${runner}-trial-${String(trial).padStart(2, "0")}`;
}

function runnerSlug(id) {
  return String(id).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

function displayAgent(id) {
  if (id === "claude-code") return "Claude Code";
  if (id === "codex") return "Codex";
  if (id === "codebuddy") return "CodeBuddy Code";
  return id;
}

function renderEvidence(item) {
  if (item.kind === "user_correction") {
    return `- Explicit user correction (${Math.round(Number(item.confidence ?? 0) * 100)}% detector confidence)`;
  }
  if (item.kind === "repo_file") {
    return `- Repository file \`${item.path}\`: ${item.fact}`;
  }
  if (item.kind === "package_metadata") {
    return `- Package metadata \`${item.key}\`: \`${item.value}\``;
  }
  return `- ${item.kind}`;
}
