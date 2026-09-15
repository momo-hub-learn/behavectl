import { compileAll } from "./compiler.mjs";
import { behaviorPatchDigest } from "./fingerprint.mjs";

export async function promotePatch(store, patchId, { force = false } = {}) {
  const patch = await store.patch(patchId);
  if (!patch) throw new Error(`Patch not found: ${patchId}`);

  if (patch.status === "active") {
    return {
      patch,
      artifacts: await compileAll(store.repoRoot, await store.patches()),
      changed: false,
    };
  }

  if (["rejected", "retired"].includes(patch.status)) {
    throw new Error(
      `Cannot promote ${patchId} from status ${patch.status}. Create a new version instead.`,
    );
  }

  if (!force) {
    const currentDigest = behaviorPatchDigest(patch);
    const verifications = await store.verificationsForPatch(patchId);

    const latestRealVerification = verifications
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

    if (!latestRealVerification) {
      throw new Error(
        `Patch ${patchId} has no real Verification Run. Run \`behavectl verify ${patchId}\` first.`,
      );
    }

    if (!latestRealVerification.patchDigest) {
      throw new Error(
        `Patch ${patchId} was verified with an older unbound evaluation format. Re-run \`behavectl verify ${patchId}\`.`,
      );
    }

    if (latestRealVerification.patchDigest !== currentDigest) {
      throw new Error(
        `Patch ${patchId} changed after its latest verification. Re-run \`behavectl verify ${patchId}\` before promotion.`,
      );
    }

    if (latestRealVerification.verdict !== "promote") {
      const missing =
        latestRealVerification.coverage?.missingTargets ?? [];
      const suffix = missing.length
        ? ` Missing targets: ${missing.join(", ")}.`
        : "";
      throw new Error(
        `Patch ${patchId} is not eligible for promotion.${suffix} Run \`behavectl verify ${patchId}\` until all declared targets pass.`,
      );
    }

    const passingTargets = new Set(
      latestRealVerification.coverage?.passing ?? [],
    );
    const missingTargets = (patch.targets ?? []).filter(
      (target) => !passingTargets.has(target),
    );

    if (missingTargets.length) {
      throw new Error(
        `Patch ${patchId} is missing passing verification for: ${missingTargets.join(", ")}.`,
      );
    }
  }

  patch.status = "active";
  patch.activatedAt = new Date().toISOString();
  await store.putPatch(patch);

  const artifacts = await compileAll(store.repoRoot, await store.patches());
  return { patch, artifacts, changed: true };
}

export async function rollbackPatch(store, patchId) {
  const patch = await store.patch(patchId);
  if (!patch) throw new Error(`Patch not found: ${patchId}`);

  if (patch.status !== "active") {
    throw new Error(`Only active patches can be rolled back. ${patchId} is ${patch.status}.`);
  }

  patch.status = "retired";
  patch.retiredAt = new Date().toISOString();
  patch.retireReason = "rollback";
  await store.putPatch(patch);

  const artifacts = await compileAll(store.repoRoot, await store.patches());
  return { patch, artifacts };
}


export async function rejectPatch(store, patchId, reason = "user_review") {
  const patch = await store.patch(patchId);
  if (!patch) throw new Error(`Patch not found: ${patchId}`);

  if (patch.status === "active") {
    throw new Error("Active patches must be rolled back, not rejected.");
  }

  patch.status = "rejected";
  patch.rejectedAt = new Date().toISOString();
  patch.rejectReason = reason;
  await store.putPatch(patch);
  return patch;
}
