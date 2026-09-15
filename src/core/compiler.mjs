import { compileRegisteredAdapters } from "../adapters/registry.mjs";

// Backward-compatible entry point. The compiler is now adapter-driven: core no
// longer knows where any agent stores persistent behavior.
export async function compileAll(repoRoot, patches) {
  return compileRegisteredAdapters(repoRoot, patches);
}
