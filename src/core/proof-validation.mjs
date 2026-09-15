import {
  verifyProofIntegrity,
} from "./proof-integrity.mjs";
import {
  verifyProofBinding,
} from "./proof-binding.mjs";

export async function validateBehaviorProof(
  proofDir,
) {
  const integrity =
    await verifyProofIntegrity(proofDir);
  const binding =
    await verifyProofBinding(proofDir);

  return {
    schema: "behavectl.proof-validation-result.v1",
    proofDir,
    valid:
      integrity.valid &&
      binding.valid,
    integrity,
    binding,
  };
}

export function formatBehaviorProofValidation(
  result,
) {
  const lines = [
    "BEHAVECTL",
    "Behavior Proof verification",
    "",
    result.valid ? "✓ VALID" : "✗ INVALID",
    "",
    `${result.integrity.valid ? "✓" : "✗"} Byte integrity`,
    `  ${result.integrity.valid
      ? `${result.integrity.checked} artifacts match SHA-256`
      : summarizeIntegrity(result.integrity)}`,
    "",
    `${result.binding.valid ? "✓" : "✗"} Semantic binding`,
  ];

  for (const check of result.binding.checks) {
    lines.push(
      `  ${check.passed ? "✓" : "✗"} ${check.label}${
        check.detail
          ? ` · ${check.detail}`
          : ""
      }`,
    );
  }

  if (result.valid) {
    lines.push("");
    lines.push(
      "This proof is byte-intact and semantically bound to the exact verified Behavior Patch.",
    );
  } else {
    lines.push("");
    lines.push(
      "Do not treat this directory as a valid Behavior Proof.",
    );
  }

  return lines.join("\n");
}

function summarizeIntegrity(result) {
  if (result.missingIntegrityFile) {
    return "checksums.json missing";
  }
  if (result.invalidManifest) {
    return "invalid integrity manifest";
  }

  const issues = [
    ...(result.missing ?? []).map(
      (item) => `missing ${item}`,
    ),
    ...(result.unexpected ?? []).map(
      (item) => `unexpected ${item}`,
    ),
    ...(result.symlinks ?? []).map(
      (item) => `symlink ${item}`,
    ),
    ...(result.mismatched ?? []).map(
      (item) => `changed ${item.path}`,
    ),
  ];

  return issues.slice(0, 3).join("; ") ||
    "integrity verification failed";
}
