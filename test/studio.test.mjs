import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startStudio } from '../src/studio/server.mjs';
import { LocalStore } from '../src/core/store.mjs';

test('Studio requires local origin and token; unverified promotion remains blocked', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'studio-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  t.mock.method(http.Server.prototype,'listen',function(...args){args.at(-1)();return this});
  t.mock.method(http.Server.prototype,'address',()=>({port:4317}));
  const {server}=await startStudio({repoRoot:root});
  async function request(method,url,body,headers={}) {
    const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{method,url,headers:{host:'127.0.0.1:4317',...headers}});
    return new Promise(resolve=>server.emit('request',req,{writeHead(status){this.status=status},end(text){resolve({status:this.status,text})}}));
  }
  assert.equal((await request('GET','/',null,{host:'evil.test'})).status,403);
  const page=await request('GET','/');assert.equal(page.status,200);
  const token=page.text.match(/const token='([a-f0-9]+)'/)[1];
  assert.equal((await request('GET','/api/state')).status,403);
  const headers={'x-studio-token':token};
  assert.equal((await request('POST','/api/promote',{id:'../../outside'},headers)).status,400);
  const created = await request('POST','/api/correction',{statement:'Never edit generated files directly.',targets:['codex']},headers);
  assert.equal(created.status,200);
  const draftId=JSON.parse(created.text).patch.id;
  const saved = await request('POST','/api/save',{id:draftId,statement:'Never edit generated files directly.',targets:['codex'],spec:{id:'spec_draft',draft:true,task:'',checks:[]}},headers);
  assert.equal(saved.status,200);
  assert.equal((await request('POST','/api/verify',{id:draftId,confirm:true},headers)).status,400);
  const store=new LocalStore(root);await store.putPatch({id:'bp_test',status:'candidate',version:1,targets:['codex'],behavior:{statement:'Use source'}});
  const result=await request('POST','/api/promote',{id:'bp_test'},headers);
  assert.equal(result.status,400);assert.match(result.text,/no real Verification/);
  assert.equal((await store.patch('bp_test')).status,'candidate');
  assert.equal((await request('POST','/api/verify',{id:'bp_test'},headers)).status,400);
  assert.equal((await request('POST','/api/rollback',{id:'bp_test'},{...headers,origin:'https://evil.test'})).status,403);
});

test('explicit correction creates a reviewable draft without inventing Agent history',async t=>{
 const {proposeUserCorrection}=await import('../src/core/patches.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-entry-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new LocalStore(root);
 const entry={statement:'这个项目不要使用 npm，以后统一用 pnpm。',targets:['codex']};
 const result=await proposeUserCorrection(store,entry);
 assert.equal(result.created,true);assert.equal(result.patch.source.kind,'human_entry');assert.equal(result.patch.status,'candidate');
 assert.deepEqual(result.patch.targets,['codex']);assert.deepEqual(await store.events(),[]);
 const spec=JSON.parse(await fs.readFile(path.join(store.root,'specs',result.patch.id+'.json'),'utf8'));
 assert.equal(spec.draft,true);assert.equal(spec.checks[0].label,'Uses pnpm');
 assert.equal((await proposeUserCorrection(store,entry)).created,false);
 await assert.rejects(proposeUserCorrection(store,{...entry,targets:[]}),/目标/);
 await assert.rejects(fs.access(path.join(root,'AGENTS.md')),{code:'ENOENT'});
});

test('review marks edited rules and edited specs as stale instead of current proof',async t=>{
 const {buildReviewModel}=await import('../src/ui/review.mjs');
 const {behaviorPatchDigest,behaviorSpecDigest}=await import('../src/core/fingerprint.mjs');
 const {writeJsonAtomic}=await import('../src/core/fs.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-stale-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new LocalStore(root);const patch={id:'bp_stale',version:1,targets:['codex'],status:'tested',behavior:{statement:'Use source'}};await store.putPatch(patch);
 const spec={id:'spec_stale',draft:false,task:'Update source',checks:[{id:'source',label:'Source exists',kind:'file_exists',value:'source.json'}]};
 const file=path.join(store.root,'specs',patch.id+'.json');await writeJsonAtomic(file,spec);
 await store.putVerification({id:'verify_stale',patchId:patch.id,patchDigest:behaviorPatchDigest(patch),specDigest:behaviorSpecDigest(spec),evaluations:[{runner:'codex'}],createdAt:new Date().toISOString()});
 assert.equal((await buildReviewModel(store,patch)).verificationCurrent,true);
 assert.equal((await buildReviewModel(store,{...patch,version:2})).verificationCurrent,false);
 await writeJsonAtomic(file,{...spec,task:'Different task'});
 assert.equal((await buildReviewModel(store,patch)).verificationCurrent,false);
});
