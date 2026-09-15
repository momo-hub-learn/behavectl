import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { diagnoseProject } from '../src/core/diagnose.mjs';
import { detectCorrection } from '../src/core/corrections.mjs';
import { patchFromCorrection } from '../src/core/patches.mjs';

test('diagnosis reports actual rule conflict with a source line, and deduplicates event ids',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'behavectl-diagnose-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'package.json'),JSON.stringify({packageManager:'pnpm@10'}));
 await fs.writeFile(path.join(root,'AGENTS.md'),'# Rules\nAlways use npm.\n');
 await fs.mkdir(path.join(root,'.behavectl/events'),{recursive:true});
 const prompt='这个项目不要使用 npm，以后统一用 pnpm。';
 const events=['evt_a','evt_a','evt_b'].map(id=>({id,source:'codebuddy',kind:'UserPromptSubmit',data:{prompt}}));
 await fs.writeFile(path.join(root,'.behavectl/events/events.jsonl'),events.map(x=>JSON.stringify(x)).join('\n'));
 const d=await diagnoseProject(root);
 assert.equal(d.findings.length,2);assert.equal(d.findings[0].evidence[0].line,2);assert.equal(d.findings[1].evidence.length,2);
 assert.deepEqual(patchFromCorrection(detectCorrection(events[0])).targets,['codebuddy']);
});
test('ordinary Chinese requests do not become persistent rules',()=>{
 assert.equal(detectCorrection({id:'evt_c',source:'codex',kind:'UserPromptSubmit',data:{prompt:'帮我添加一个登录页面'}}),null);
});

test('diagnosis proposal retains evidence, stays draft, is idempotent and rejects stale evidence',async t=>{
 const {proposeFromDiagnosis}=await import('../src/core/diagnose.mjs');
 const {LocalStore}=await import('../src/core/store.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'behavectl-propose-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new LocalStore(root);
 for(const id of ['evt_one','evt_two'])await store.appendEvent({id,source:'codex',kind:'UserPromptSubmit',data:{prompt:"Don't use npm in this repo. We always use pnpm."}});
 const finding=(await diagnoseProject(root)).findings[0];
 const first=await proposeFromDiagnosis(root,finding.id);
 assert.equal(first.created,true);assert.deepEqual(first.patch.targets,['codex']);assert.equal(first.patch.status,'candidate');assert.equal(first.patch.evidence.length,2);
 const spec=JSON.parse(await fs.readFile(path.join(store.root,'specs',first.patch.id+'.json'),'utf8'));assert.equal(spec.draft,true);
 assert.equal((await proposeFromDiagnosis(root,finding.id)).created,false);assert.equal((await store.patches()).length,1);
 assert.equal((await store.verificationsForPatch(first.patch.id)).length,0);
 await fs.writeFile(store.eventsFile,'');await assert.rejects(proposeFromDiagnosis(root,finding.id),/依据已变化/);
});
