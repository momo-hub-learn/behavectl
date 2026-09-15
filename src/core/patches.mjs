import { makeId } from "./id.mjs";

export function patchFromCorrection(correction) {
  return {
    schema: "behavectl.behavior-patch.v1",
    id: makeId("bp"),
    version: 1,
    source: {
      kind: "user_correction",
      eventId: correction.eventId,
      correctionId: correction.id,
      sourceAgent: correction.runSource,
    },
    scope: {
      kind: "project",
    },
    behavior: {
      statement: correction.rawText,
    },
    evidence: [
      {
        kind: "user_correction",
        eventId: correction.eventId,
        text: correction.rawText,
        confidence: correction.confidence,
      },
    ],
    risk: "L1",
    targets: [correction.runSource],
    status: "candidate",
    createdAt: new Date().toISOString(),
  };
}

// Explicit user entry is retained as such; it is not a detected Agent failure.
export async function proposeUserCorrection(store, { statement, targets }) {
  if (typeof statement !== 'string' || !statement.trim() || statement.length > 8000) throw new Error('请输入 1–8000 字的规则。');
  if (!Array.isArray(targets) || !targets.length || !targets.every(x => ['codex','codebuddy','claude-code'].includes(x))) throw new Error('请选择有效的目标 Agent。');
  const normalized = [...new Set(targets)].sort();
  for (const patch of await store.patches()) {
    if (patch.source?.kind === 'human_entry' && patch.behavior.statement === statement.trim() && JSON.stringify([...patch.targets].sort()) === JSON.stringify(normalized) && ['candidate','tested'].includes(patch.status)) return { patch, created: false };
  }
  const patch = {
    schema: 'behavectl.behavior-patch.v1', id: makeId('bp'), version: 1,
    source: { kind: 'human_entry' }, scope: { kind: 'project' },
    behavior: { statement: statement.trim() }, targets: normalized, risk: 'L1',
    evidence: [{ kind: 'human_entry', text: statement.trim() }],
    status: 'candidate', createdAt: new Date().toISOString(),
  };
  const { enrichPatchFromRepo } = await import('./evidence.mjs');
  const { writeSuggestedSpec } = await import('./specs.mjs');
  await enrichPatchFromRepo(patch, store.repoRoot);
  await writeSuggestedSpec(store, patch);
  await store.putPatch(patch);
  return { patch, created: true };
}
