import fs from "node:fs/promises";
import path from "node:path";

import { behaviorPatchDigest } from "./fingerprint.mjs";

export async function verifyProofBinding(proofDir) {
  const root = path.resolve(proofDir);

  const manifest = await readJsonOptional(
    path.join(root, "manifest.json"),
  );
  const patch = await readJsonOptional(
    path.join(root, "patch.json"),
  );
  const verification = await readJsonOptional(
    path.join(root, "verification.json"),
  );

  const currentPatchDigest =
    patch ? behaviorPatchDigest(patch) : null;

  const evaluationDigests =
    verification?.evaluations?.map(
      (evaluation) => evaluation.patchDigest,
    ) ?? [];

  const checks = [
    {
      id: "structure",
      label: "Proof structure",
      passed: Boolean(manifest && patch && verification),
      detail:
        manifest && patch && verification
          ? "manifest.json + patch.json + verification.json"
          : "Missing manifest.json, patch.json, or verification.json",
    },
    {
      id: "manifest-patch",
      label: "Manifest binds exact patch",
      passed:
        Boolean(currentPatchDigest) &&
        manifest?.patchDigest === currentPatchDigest,
      detail:
        currentPatchDigest && manifest?.patchDigest === currentPatchDigest
          ? `sha256:${currentPatchDigest.slice(0, 12)}…`
          : "manifest.patchDigest does not match patch.json",
    },
    {
      id: "verification-patch",
      label: "Verification binds exact patch",
      passed:
        Boolean(currentPatchDigest) &&
        verification?.patchDigest === currentPatchDigest,
      detail:
        currentPatchDigest &&
        verification?.patchDigest === currentPatchDigest
          ? `sha256:${currentPatchDigest.slice(0, 12)}…`
          : "verification.patchDigest does not match patch.json",
    },
    {
      id: "evaluations-patch",
      label: "Every evaluation binds exact patch",
      passed:
        Boolean(currentPatchDigest) &&
        evaluationDigests.length > 0 &&
        evaluationDigests.every(
          (digest) => digest === currentPatchDigest,
        ),
      detail:
        evaluationDigests.length > 0 &&
        currentPatchDigest &&
        evaluationDigests.every(
          (digest) => digest === currentPatchDigest,
        )
          ? `${evaluationDigests.length} evaluations bound`
          : "One or more evaluation digests do not match patch.json",
    },
    {
      id: "verification-verdict",
      label: "Verification verdict is promotable",
      passed:
        verification?.verdict === "promote" &&
        manifest?.verdict === "promote",
      detail:
        `manifest=${String(manifest?.verdict ?? "missing").toUpperCase()} · verification=${String(verification?.verdict ?? "missing").toUpperCase()}`,
    },
  ];

  const requiredTargets =
    verification?.coverage?.requiredTargets ??
    patch?.targets ??
    [];

  const passingTargets =
    verification?.coverage?.passing ?? [];

  const missingTargets = requiredTargets.filter(
    (target) => !passingTargets.includes(target),
  );

  checks.push({
    id: "target-coverage",
    label: "Every declared target passed verification",
    passed: missingTargets.length === 0,
    detail:
      missingTargets.length === 0
        ? requiredTargets.length
          ? requiredTargets.join(", ")
          : "No declared targets"
        : `Missing: ${missingTargets.join(", ")}`,
  });

  return {
    schema: "behavectl.proof-binding-result.v1",
    proofDir: root,
    valid: checks.every((check) => check.passed),
    patchId: patch?.id ?? manifest?.patchId ?? null,
    patchDigest: currentPatchDigest,
    checks,
    missingTargets,
  };
}

export function formatProofBinding(result) {
  const lines = [
    "BEHAVECTL",
    "Behavior Proof binding",
    "",
    result.valid ? "✓ VALID" : "✗ INVALID",
    "",
  ];

  for (const check of result.checks) {
    lines.push(
      `${check.passed ? "✓" : "✗"} ${check.label}${
        check.detail ? ` · ${check.detail}` : ""
      }`,
    );
  }

  return lines.join("\n");
}

async function readJsonOptional(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return null;
  }
}
