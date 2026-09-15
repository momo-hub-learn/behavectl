import path from "node:path";
import fs from "node:fs/promises";
import { appendJsonl, ensureDir, readJson, readJsonl, writeJsonAtomic } from "./fs.mjs";

export class LocalStore {
  constructor(repoRoot) {
    this.repoRoot = path.resolve(repoRoot);
    this.root = path.join(this.repoRoot, ".behavectl");
    this.eventsFile = path.join(this.root, "events", "events.jsonl");
    this.patchDir = path.join(this.root, "patches");
    this.evalDir = path.join(this.root, "evals");
    this.proofDir = path.join(this.root, "proofs");
    this.verificationDir = path.join(this.root, "verifications");
    this.stateFile = path.join(this.root, "state.json");
  }

  async init() {
    await ensureDir(path.dirname(this.eventsFile));
    await ensureDir(this.patchDir);
    await ensureDir(this.evalDir);
    await ensureDir(this.proofDir);
    await ensureDir(this.verificationDir);
    const state = await readJson(this.stateFile, null);
    if (!state) {
      await writeJsonAtomic(this.stateFile, {
        schema: "behavectl.state.v1",
        processedEventIds: [],
        createdAt: new Date().toISOString(),
      });
    }
  }

  async appendEvent(event) {
    await this.init();
    await appendJsonl(this.eventsFile, event);
  }

  async events() {
    return readJsonl(this.eventsFile);
  }

  async state() {
    return readJson(this.stateFile, { processedEventIds: [] });
  }

  async markProcessed(eventIds) {
    const state = await this.state();
    const set = new Set(state.processedEventIds ?? []);
    for (const id of eventIds) set.add(id);
    state.processedEventIds = [...set];
    state.updatedAt = new Date().toISOString();
    await writeJsonAtomic(this.stateFile, state);
  }

  async putEvaluation(evaluation) {
    await this.init();
    await writeJsonAtomic(
      path.join(this.evalDir, `${evaluation.id}.json`),
      evaluation,
    );
  }

  async evaluationsForPatch(patchId) {
    const names = await readDirOrEmpty(this.evalDir);
    const evaluations = [];
    for (const name of names.filter((x) => x.endsWith(".json")).sort()) {
      const value = await readJson(path.join(this.evalDir, name), null);
      if (value?.patchId === patchId) evaluations.push(value);
    }
    return evaluations;
  }


  async putVerification(verification) {
    await this.init();
    await writeJsonAtomic(
      path.join(this.verificationDir, `${verification.id}.json`),
      verification,
    );
  }

  async verificationsForPatch(patchId) {
    const names = await readDirOrEmpty(this.verificationDir);
    const values = [];

    for (const name of names.filter((x) => x.endsWith(".json")).sort()) {
      const value = await readJson(
        path.join(this.verificationDir, name),
        null,
      );
      if (value?.patchId === patchId) values.push(value);
    }

    return values;
  }

  async updatePatch(id, mutate) {
    const patch = await this.patch(id);
    if (!patch) throw new Error(`Patch not found: ${id}`);
    const next = await mutate(structuredClone(patch));
    await this.putPatch(next);
    return next;
  }

  async putPatch(patch) {
    await this.init();
    await writeJsonAtomic(path.join(this.patchDir, `${patch.id}.json`), patch);
  }

  async patch(id) {
    return readJson(path.join(this.patchDir, `${id}.json`), null);
  }

  async patches() {
    const names = await readDirOrEmpty(this.patchDir);
    const patches = [];
    for (const name of names.filter((x) => x.endsWith(".json")).sort()) {
      const p = await readJson(path.join(this.patchDir, name), null);
      if (p) patches.push(p);
    }
    return patches;
  }
}


async function readDirOrEmpty(dir) {
  try {
    return await fs.readdir(dir);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}
