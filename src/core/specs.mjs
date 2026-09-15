import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "./fs.mjs";

// Resolve explicit preference before repository metadata. Ambiguity stays a draft.
export function packageManagerIntent(statement) {
  const text = String(statement ?? '').toLowerCase();
  const names = '(pnpm|npm|yarn|bun)';
  const chosen = new Set();
  const forbidden = new Set();
  for (const clause of text.split(/[.!;。！；\n]/)) {
    const replacement = clause.match(new RegExp('(?:use|prefer)\\s+' + names + '\\s+instead\\s+of\\s+' + names));
    if (replacement) { chosen.add(replacement[1]); forbidden.add(replacement[2]); continue; }
    const negative = clause.match(new RegExp("(?:don't|do not|never|dont)\\s+(?:use\\s+)?" + names + '\\b'))
      ?? clause.match(new RegExp('(?:不要|禁止|不再)(?:使用|用)?\\s*' + names + '\\b'));
    if (negative) forbidden.add(negative[1]);
    const positive = clause.match(new RegExp('(?:always|we)\\s+(?:use|prefer)\\s+' + names + '\\b'))
      ?? clause.match(new RegExp('(?:统一|始终|改为)(?:使用|用)?\\s*' + names + '\\b'));
    if (positive) chosen.add(positive[1]);
    if (!negative && !positive) {
      const simple = clause.match(new RegExp('^\\s*(?:use|prefer)\\s+' + names + '\\b'));
      if (simple) chosen.add(simple[1]);
    }
  }
  return { chosen: [...chosen], forbidden: [...forbidden] };
}

function packageManagerFromPatch(patch) {
  const intent = packageManagerIntent(patch?.behavior?.statement);
  if (intent.chosen.length > 1) return null;
  if (intent.chosen.length === 1) return intent.forbidden.includes(intent.chosen[0]) ? null : intent.chosen[0];
  // Metadata alone does not turn unrelated feedback into a package-manager rule.
  if (!/\b(pnpm|npm|yarn|bun)\b/i.test(patch?.behavior?.statement ?? '')) return null;
  const metadata = patch.evidence?.find(x => x.kind === 'package_metadata' && x.key === 'packageManager');
  const manager = metadata?.value?.split('@')[0];
  return ['pnpm','npm','yarn','bun'].includes(manager) && !intent.forbidden.includes(manager) ? manager : null;
}

function forbiddenPackageManagers(manager, statement) {
  return packageManagerIntent(statement).forbidden.filter(x => x !== manager);
}

export function suggestBehaviorSpec(patch) {
  const statement = String(patch?.behavior?.statement ?? "");
  const manager = packageManagerFromPatch(patch);

  if (manager) {
    const forbidden = forbiddenPackageManagers(manager, statement);
    const checks = [
      {
        id: `uses-${manager}`,
        label: `Uses ${manager}`,
        kind: "command_matches",
        value: `\\b${manager}\\b`,
      },
      ...forbidden.map((other) => ({
        id: `avoids-${other}`,
        label: `Avoids ${other}`,
        kind: "command_not_matches",
        value: `\\b${other}\\b`,
      })),
    ];

    if (manager === "pnpm") {
      checks.push({
        id: "no-package-lock",
        label: "No package-lock.json",
        kind: "file_not_exists",
        value: "package-lock.json",
      });
    }

    return {
      schema: "behavectl.behavior-spec.v1",
      id: `spec_${patch.id}`,
      generatedFromPatchId: patch.id,
      draft: true,
      rationale:
        "Suggested from package-manager behavior and repository evidence. Review before running a real Behavior Diff.",
      task:
        "Make a small dependency-management change appropriate for this repository so the chosen package-manager behavior is observable. Do not change unrelated code.",
      checks,
      regressionCommands: [],
    };
  }

  return {
    schema: "behavectl.behavior-spec.v1",
    id: `spec_${patch.id}`,
    generatedFromPatchId: patch.id,
    draft: true,
    rationale:
      "Behavectl could not derive deterministic checks for this behavior. Fill in a concrete task and checks before testing.",
    task: "",
    checks: [],
    regressionCommands: [],
  };
}

export async function writeSuggestedSpec(store, patch) {
  const spec = suggestBehaviorSpec(patch);
  const dir = path.join(store.root, "specs");
  await ensureDir(dir);
  const file = path.join(dir, `${patch.id}.json`);
  await writeJsonAtomic(file, spec);
  return { spec, file };
}

export async function defaultSpecPath(store, patchId) {
  const file = path.join(store.root, "specs", `${patchId}.json`);
  try {
    await fs.access(file);
    return file;
  } catch {
    return null;
  }
}
