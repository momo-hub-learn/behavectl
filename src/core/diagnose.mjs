import fs from 'node:fs/promises';
import path from 'node:path';
import { LocalStore } from './store.mjs';
import { detectCorrection } from './corrections.mjs';
import { createHash } from 'node:crypto';
import { writeJsonAtomic } from './fs.mjs';
import { packageManagerIntent, suggestBehaviorSpec } from './specs.mjs';

// A bounded, read-only scan. It never treats project text as executable instructions.
export async function diagnoseProject(repoRoot) {
  const root = await fs.realpath(repoRoot);
  const sources = [];
  async function read(relative) {
    const file = path.join(root, relative);
    try {
      const real = await fs.realpath(file);
      if (!real.startsWith(root + path.sep)) return;
      const stat = await fs.stat(real);
      if (!stat.isFile() || stat.size > 1024 * 1024) return;
      const text = await fs.readFile(real, 'utf8');
      sources.push({ path: relative, text });
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await read('AGENTS.md');
  await read('CLAUDE.md');
  await read('CODEBUDDY.md');
  await read('package.json');
  await read('.behavectl/events/events.jsonl');
  const findings = [];
  let manager;
  try { manager = JSON.parse(sources.find(x => x.path === 'package.json')?.text ?? '{}').packageManager?.split('@')[0]; } catch {}
  for (const source of sources.filter(x => x.path.endsWith('.md'))) {
    source.text.split(/\r?\n/).forEach((text, i) => {
      const intent = packageManagerIntent(text);
      if (manager && intent.chosen.length === 1 && intent.chosen[0] !== manager) {
        findings.push({ kind: 'rule_conflict', title: '项目声明与规则要求不一致', detail: `package.json 声明 ${manager}，规则要求 ${intent.chosen[0]}。需要确认哪一个是当前约定。`, evidence: [{ path: source.path, line: i + 1, text }, { path: 'package.json', text: `packageManager: ${manager}` }], recommendation: '先确认项目约定，再修改冲突规则；不要直接把两条规则都追加给 Agent。' });
      }
    });
  }
  const groups = new Map();
  let eventCount = 0;
  for (const [i,line] of (sources.find(x => x.path.endsWith('events.jsonl'))?.text ?? '').split('\n').entries()) {
    if (!line.trim()) continue;
    let event; try { event = JSON.parse(line); } catch { continue; }
    eventCount++;
    if (!event.id) continue;
    const correction = detectCorrection(event);
    if (!correction) continue;
    const key = correction.rawText.toLowerCase().replace(/\s+/g, ' ').trim();
    const group = groups.get(key) ?? new Map();
    group.set(event.id, { path: '.behavectl/events/events.jsonl', line: i + 1, text: correction.rawText, agent: event.source, eventId: event.id });
    groups.set(key, group);
  }
  for (const group of groups.values()) if (group.size > 1) findings.push({ kind: 'repeated_correction', title: `相同纠正出现 ${group.size} 次`, detail: [...group.values()][0].text, evidence: [...group.values()], recommendation: '这是重复提醒的证据，不等同于 Agent 失败次数。可把它转成待审查规则并设计真实验证。' });
  for (const finding of findings) finding.id = createHash('sha256').update(JSON.stringify({ kind: finding.kind, evidence: finding.evidence })).digest('hex').slice(0, 24);
  return { project: path.basename(root), scannedFiles: sources.map(x => x.path), eventCount, findings, scope: '仅读取项目根规则、package.json 与 Behavectl 已捕获事件。不读取全局聊天历史，不调用模型。' };
}

export async function proposeFromDiagnosis(repoRoot, findingId) {
  // Re-read evidence: a stale browser report cannot create a new proposal.
  const report = await diagnoseProject(repoRoot);
  const finding = report.findings.find(x => x.id === findingId);
  if (!finding) throw new Error('诊断依据已变化，请重新检查项目。');
  if (finding.kind !== 'repeated_correction') throw new Error('冲突需要先确认正式约定，不能自动追加一条相反规则。');
  const store = new LocalStore(repoRoot);
  const id = `bp_diagnosis_${finding.id}`;
  const existing = await store.patch(id);
  if (existing) return { patch: existing, created: false };
  const targets = [...new Set(finding.evidence.map(x => x.agent))];
  const patch = {
    schema: 'behavectl.behavior-patch.v1', id, version: 1,
    source: { kind: 'diagnosis', findingId }, scope: { kind: 'project' },
    behavior: { statement: finding.detail }, targets, risk: 'L1', status: 'candidate',
    evidence: finding.evidence.map(x => ({ ...x, kind: 'user_correction', confidence: null })),
    createdAt: new Date().toISOString(),
  };
  const spec = suggestBehaviorSpec(patch);
  await writeJsonAtomic(path.join(store.root, 'specs', `${id}.json`), spec);
  await store.putPatch(patch);
  return { patch, created: true };
}
