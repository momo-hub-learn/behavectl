import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { proposeUserCorrection } from '../core/patches.mjs';
import { LocalStore } from '../core/store.mjs';
import { doctor } from '../core/doctor.mjs';
import { buildReviewModel } from '../ui/review.mjs';
import { promotePatch, rollbackPatch } from '../core/lifecycle.mjs';
import { verifyAcrossAgents } from '../core/verify.mjs';
import { createAgentRunner } from '../adapters/registry.mjs';
import { createBehaviorProof } from '../core/proof.mjs';
import { diagnoseProject, proposeFromDiagnosis } from '../core/diagnose.mjs';
import { writeJsonAtomic } from '../core/fs.mjs';

export async function startStudio({ repoRoot, port = 4317 }) {
  const store = new LocalStore(repoRoot);
  const token = randomBytes(24).toString('hex');
  let job = null;
  let mutationPending = false;
  const server = http.createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    let locked = false;
    try {
      const host = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`)) return send(403, { error: 'Local origin required' });
      const url = new URL(req.url, `http://${host}`);
      if (req.method === 'GET' && url.pathname === '/') {
        const html = (await fs.readFile(new URL('./index.html', import.meta.url), 'utf8')).replace('__TOKEN__', token);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" });
        return res.end(html);
      }
      if (req.headers['x-studio-token'] !== token) return send(403, { error: 'Studio token required' });
      if (req.method === 'GET' && url.pathname === '/api/diagnose') return send(200, await diagnoseProject(repoRoot));
      if (req.method === 'GET' && url.pathname === '/api/state') {
        const patches = await store.patches();
        return send(200, { project: path.basename(repoRoot), path: repoRoot, health: await doctor(), models: await Promise.all(patches.map(p => buildReviewModel(store, p))), job });
      }
      if (req.method !== 'POST') return send(404, { error: 'Not found' });
      if (mutationPending) return send(409, { error: 'Another operation is in progress.' });
      mutationPending = true; locked = true;
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 131072) throw new Error('Request too large'); }
      const body = JSON.parse(raw || '{}');
      if (job?.state === 'running') return send(409, { error: 'A verification is running. Wait before changing rules.' });
      if (url.pathname === '/api/correction') return send(200, await proposeUserCorrection(store, body));
      if (url.pathname === '/api/propose') return send(200, await proposeFromDiagnosis(repoRoot, body.findingId));
      if (!/^bp_[a-zA-Z0-9_-]+$/.test(body.id ?? '')) throw new Error('Invalid patch id');
      const patch = await store.patch(body.id);
      if (!patch) return send(404, { error: 'Patch not found' });
      if (job?.state === 'running') return send(409, { error: 'A verification is running. Wait before changing rules.' });
      if (url.pathname === '/api/save') {
        if (patch.status === 'active') throw new Error('Roll back the active rule before editing.');
        if (!body.statement?.trim() || !body.targets?.length || !body.targets.every(x => ['codex','codebuddy','claude-code'].includes(x))) throw new Error('Rule and targets are required');
        if (!body.spec || typeof body.spec !== 'object' || !Array.isArray(body.spec.checks)) throw new Error('A specification with a checks array is required');
        if (body.spec.draft !== true && (!body.spec.task?.trim() || !body.spec.checks.length)) throw new Error('A reviewed specification needs a task and checks');
        patch.behavior.statement = body.statement.trim(); patch.targets = [...new Set(body.targets)]; patch.version = (patch.version ?? 1) + 1; patch.status = 'candidate';
        await store.putPatch(patch);
        await writeJsonAtomic(path.join(store.root, 'specs', `${patch.id}.json`), body.spec);
        return send(200, { ok: true });
      }
      if (url.pathname === '/api/promote') {
        const model = await buildReviewModel(store, patch);
        if (model.verification && !model.verificationCurrent) throw new Error('规则或检查条件已改变，请重新验证后再启用。');
        return send(200, await promotePatch(store, patch.id));
      }
      if (url.pathname === '/api/rollback') return send(200, await rollbackPatch(store, patch.id));
      if (url.pathname === '/api/verify') {
        if (body.confirm !== true) throw new Error('Confirm real model usage first');
        const model = await buildReviewModel(store, patch);
        if (!model.spec || model.spec.draft || !model.spec.checks?.length) throw new Error('Review and save a complete test specification first');
        const health = await doctor();
        const missing = patch.targets.filter(id => !health.ready[id]);
        if (missing.length) throw new Error(`Missing Agent CLI: ${missing.join(', ')}`);
        job = { state: 'running', id: patch.id, events: [], startedAt: new Date().toISOString() };
        const current = job;
        (async () => {
          try {
            const record = await verifyAcrossAgents({ repoRoot, patch, spec: model.spec, runners: patch.targets.map(id => createAgentRunner(id)), repeat: 3, onProgress: async e => { current.events.push({ agent: e.agent, trial: e.trial, phase: e.phase, state: e.state }); } });
            for (const evaluation of record.evaluations) await store.putEvaluation(evaluation);
            await store.putVerification(record);
            if (record.verdict === 'promote') { await store.updatePatch(patch.id, p => ({ ...p, status: 'tested' })); await createBehaviorProof(store, patch.id); }
            current.state = 'done'; current.verdict = record.verdict;
          } catch (error) { current.state = 'failed'; current.error = error.message; }
        })();
        return send(202, current);
      }
      send(404, { error: 'Not found' });
    } catch (error) { send(400, { error: error.message }); }
    finally { if (locked) mutationPending = false; }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
