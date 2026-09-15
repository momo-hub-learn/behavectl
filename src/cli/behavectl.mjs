#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { normalizeClaudeHook } from "../core/events.mjs";
import { normalizeCodexHook } from "../adapters/codex/events.mjs";
import { detectCorrection } from "../core/corrections.mjs";
import { patchFromCorrection } from "../core/patches.mjs";
import { LocalStore } from "../core/store.mjs";
import { installClaudeHooks, uninstallClaudeHooks } from "../adapters/claude/hooks.mjs";
import { installCodexHooks, uninstallCodexHooks } from "../adapters/codex/hooks.mjs";
import { enrichPatchFromRepo } from "../core/evidence.mjs";
import { promotePatch, rejectPatch, rollbackPatch } from "../core/lifecycle.mjs";
import { evaluateBehaviorPatch, formatBehaviorDiff, loadBehaviorSpec } from "../core/eval/engine.mjs";
import { FixtureRunner } from "../core/eval/runners.mjs";
import { doctor } from "../core/doctor.mjs";
import {
  canonicalAgentId,
  canonicalizeAgentList,
  createAgentRunner,
  displayAgentName,
  listAgentDefinitions,
  agentDefinition,
  registerExternalAdapter,
} from "../adapters/registry.mjs";
import { defaultSpecPath, writeSuggestedSpec } from "../core/specs.mjs";
import { installHookBridge } from "../core/hook-bridge.mjs";
import { createBehaviorProof } from "../core/proof.mjs";
import { formatBehaviorProofValidation, validateBehaviorProof } from "../core/proof-validation.mjs";
import { buildVerificationRecord, formatBehaviorMatrix, verifyAcrossAgents } from "../core/verify.mjs";
import { createKillerDemoRepo, KILLER_DEMO_PATCH_ID } from "../core/demo-repo.mjs";
import { buildReviewModel, renderInbox, renderReview, reviewPatch } from "../ui/review.mjs";
import { buildHomeModel, renderHome } from "../ui/home.mjs";
import { renderProductTour } from "../ui/tour.mjs";
import { renderCliError } from "../ui/error.mjs";
import {
  renderDoctorSurface,
  renderHelpSurface,
  renderInitSurface,
  renderUninstallSurface,
} from "../ui/setup.mjs";
import { formatLivePreflight, livePreflight, runLiveValidation } from "../core/live.mjs";
import { evaluateBehaviorCI, formatBehaviorCI, installBehaviorCI, renderBehaviorCIMarkdown } from "../core/ci.mjs";
import { buildBehaviorHistory, formatBehaviorHistory } from "../core/history.mjs";
import { formatProtocolBundleReplay, formatProtocolReplay, replayProtocolFile, replayTraceBundle } from "../core/protocol-replay.mjs";
import { assessReleaseCandidate, formatReleaseCandidate, runReleaseCandidate } from "../core/release-candidate.mjs";
import { assessReleaseShard, formatReleaseShard, mergeReleaseShards, runReleaseShard } from "../core/release-shard.mjs";
import {
  agentNativeStatus,
  installAgentNative,
  uninstallAgentNative,
} from "../agent/install.mjs";
import { startBehavectlMcp } from "../agent/mcp.mjs";
import {
  renderAgentNativeInstall,
  renderAgentNativeStatus,
} from "../ui/agent-native.mjs";

const args = process.argv.slice(2);
const command = args[0] ?? "home";
const repoRoot = findRepoRoot(process.cwd());
const store = new LocalStore(repoRoot);
const cliFile = fileURLToPath(import.meta.url);

async function main() {
  await loadExternalAdaptersFromArgs();
  if (command === "diagnose") {
    const { diagnoseProject, proposeFromDiagnosis } = await import("../core/diagnose.mjs");
    const findingId = option("--propose");
    if (findingId) {
      const result = await proposeFromDiagnosis(repoRoot, findingId);
      console.log(`${result.created ? "Created" : "Existing"} draft: ${result.patch.id}`);
      console.log(`Targets: ${result.patch.targets.join(", ")}`);
      console.log(`Next: behavectl review ${result.patch.id}`);
      return;
    }
    const report = await diagnoseProject(repoRoot);
    if (args.includes("--json")) { console.log(JSON.stringify(report, null, 2)); return; }
    console.log(`Behavectl · Project diagnosis · ${report.project}`);
    console.log(`${report.scannedFiles.length} files · ${report.eventCount} captured events · ${report.findings.length} findings`);
    for (const finding of report.findings) {
      console.log(`\n${finding.title}\n${finding.detail}`);
      for (const item of finding.evidence) console.log(`  ${item.path}${item.line ? ":" + item.line : ""} · ${item.text}`);
      console.log(finding.recommendation);
      if (finding.kind === "repeated_correction") console.log(`  behavectl diagnose --propose ${finding.id}`);
    }
    console.log(`\n${report.scope}`);
    return;
  }
  if (command === "studio") {
    const { startStudio } = await import("../studio/server.mjs");
    const studio = await startStudio({ repoRoot, port: integerOption("--port", 4317, { min: 0, max: 65535 }) });
    console.log(`Behavectl Studio · ${studio.url}`);
    console.log(`Project · ${repoRoot}`);
    console.log("Open this URL in your browser. Ctrl+C stops the local server.");
    return;
  }
  if (command === "home") {
    const health = await doctor();
    const model = await buildHomeModel({
      store,
      repoRoot,
      health,
    });
    console.log(renderHome(model, {
      plain: args.includes("--plain"),
    }));
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    const pkg = JSON.parse(
      await fs.readFile(
        new URL("../../package.json", import.meta.url),
        "utf8",
      ),
    );
    console.log(pkg.version);
    return;
  }

  if (command === "mcp") {
    await startBehavectlMcp({
      repoRoot:
        process.env.CLAUDE_PROJECT_DIR ??
        process.env.BEHAVECTL_PROJECT_DIR ??
        repoRoot,
      version:
        await packageVersion(),
    });
    return;
  }

  if (
    command === "--help" ||
    command === "-h" ||
    command === "help"
  ) {
    if (args.includes("--all")) {
      printHelp();
    } else {
      console.log(
        renderHelpSurface({
          version: await packageVersion(),
        }),
      );
    }
    return;
  }


  if (command === "agent") {
    const action =
      args[1] ?? "status";

    if (action === "status") {
      const status =
        await agentNativeStatus({
          repoRoot,
        });

      if (args.includes("--json")) {
        console.log(
          JSON.stringify(
            status,
            null,
            2,
          ),
        );
      } else {
        console.log(
          renderAgentNativeStatus(
            status,
          ),
        );
      }
      return;
    }

    if (
      action === "install" ||
      action === "uninstall"
    ) {
      const explicit =
        args.includes("--claude") ||
        args.includes("--codex") ||
        args.includes("--all");

      const claude =
        args.includes("--all") ||
        args.includes("--claude") ||
        !explicit;

      const codex =
        args.includes("--all") ||
        args.includes("--codex") ||
        !explicit;

      const mcp =
        args.includes("--mcp");

      if (action === "install") {
        const result =
          await installAgentNative({
            repoRoot,
            version:
              await packageVersion(),
            claude,
            codex,
            mcp,
          });

        console.log(
          renderAgentNativeInstall(
            result,
          ),
        );
        return;
      }

      const result =
        await uninstallAgentNative({
          repoRoot,
          claude,
          codex,
          mcp,
        });

      console.log(
        renderAgentNativeInstall(
          {
            ...result,
            results:
              result.results.map(
                (item) => ({
                  ...item,
                  label:
                    `${item.label} removed`,
                }),
              ),
          },
          {
            uninstall: true,
          },
        ),
      );
      return;
    }

    throw new Error(
      "Usage: behavectl agent install|status|uninstall [--claude|--codex|--all] [--mcp]",
    );
  }

  if (command === "init") {
    await store.init();
    const bridgeFile =
      await installHookBridge(repoRoot);

    const explicit =
      args.includes("--all") ||
      args.includes("--claude") ||
      args.includes("--codex");

    const health = await doctor();

    const claudeDetected =
      health.claude.installed ||
      (await pathExists(
        path.join(repoRoot, ".claude"),
      ));

    const codexDetected =
      health.codex.installed ||
      (await pathExists(
        path.join(repoRoot, ".codex"),
      ));

    const installClaude =
      args.includes("--all") ||
      args.includes("--claude") ||
      (!explicit && claudeDetected);

    const installCodex =
      args.includes("--all") ||
      args.includes("--codex") ||
      (!explicit && codexDetected);

    const installMcp =
      args.includes("--mcp");

    const agents = [];

    if (installClaude) {
      const result =
        await installClaudeHooks(
          repoRoot,
          bridgeFile,
        );

      agents.push({
        name: "Claude Code",
        connected: true,
        detail: result.changed
          ? "connected"
          : "already connected",
      });
    }

    if (installCodex) {
      const result =
        await installCodexHooks(
          repoRoot,
          bridgeFile,
        );

      agents.push({
        name: "Codex",
        connected: true,
        detail: result.changed
          ? "connected"
          : "already connected",
      });
    }

    await installAgentNative({
      repoRoot,
      version:
        await packageVersion(),
      claude: installClaude,
      codex: installCodex,
      mcp:
        installMcp &&
        installClaude,
    });

    console.log(
      renderInitSurface({
        repo: path.basename(repoRoot),
        bridgePath:
          path.relative(
            repoRoot,
            bridgeFile,
          ),
        agents,
        codexTrustNote:
          installCodex,
      }),
    );

    if (
      installClaude ||
      installCodex
    ) {
      console.log("");
      console.log(
        "Agent-native skill installed. Behavectl is now directly discoverable inside your coding agent.",
      );
    }

    if (
      installMcp &&
      installClaude
    ) {
      console.log(
        "Claude Code MCP tools installed in .mcp.json (project scope).",
      );
    }

    return;
  }

  if (command === "uninstall") {
    const claude =
      await uninstallClaudeHooks(
        repoRoot,
      );
    const codex =
      await uninstallCodexHooks(
        repoRoot,
      );

    console.log(
      renderUninstallSurface({
        claudeChanged:
          claude.changed,
        codexChanged:
          codex.changed,
      }),
    );
    return;
  }

  if (command === "hook" && args[1] === "claude") {
    await store.init();
    const rawText = await readStdin();
    if (!rawText.trim()) throw new Error("Expected Claude hook JSON on stdin.");
    const raw = JSON.parse(rawText);
    const event = normalizeClaudeHook(raw, repoRoot);
    await store.appendEvent(event);
    // Hooks must stay quiet and fast. No stdout output on success.
    return;
  }

  if (command === "hook" && args[1] === "codex") {
    await store.init();
    const rawText = await readStdin();
    if (!rawText.trim()) throw new Error("Expected Codex hook JSON on stdin.");
    const raw = JSON.parse(rawText);
    const event = normalizeCodexHook(raw, repoRoot);
    await store.appendEvent(event);
    return;
  }

  if (command === "learn") {
    const events = await store.events();
    const state = await store.state();
    const processed = new Set(state.processedEventIds ?? []);
    const newlyProcessed = [];
    const patches = [];

    for (const event of events) {
      if (processed.has(event.id)) continue;
      newlyProcessed.push(event.id);

      const correction = detectCorrection(event);
      if (!correction) continue;

      const patch = patchFromCorrection(correction);
      await enrichPatchFromRepo(patch, repoRoot);
      await store.putPatch(patch);
      patches.push(patch);
    }

    if (newlyProcessed.length) {
      await store.markProcessed(newlyProcessed);
    }

    if (patches.length === 0) {
      console.log("No high-confidence behavior changes found.");
      return;
    }

    for (const patch of patches) {
      console.log(`${patch.id}  candidate`);
      console.log(`  ${patch.behavior.statement}`);
    }
    return;
  }


  if (command === "inbox") {
    console.log(await renderInbox(store));
    return;
  }

  if (command === "review") {
    const requested =
      args[1] && !args[1].startsWith("--") ? args[1] : null;

    const patches = await store.patches();
    const candidates = patches
      .filter((patch) => ["candidate", "tested"].includes(patch.status))
      .sort((a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt)),
      );

    const patch = requested
      ? await store.patch(requested)
      : candidates[0];

    if (!patch) {
      console.log("✓ No behavior changes waiting for review.");
      return;
    }

    if (args.includes("--plain")) {
      console.log(
        renderReview(await buildReviewModel(store, patch), {
          plain: true,
        }),
      );
      return;
    }

    const preferredAgent = option("--agent");
    const health = await doctor();
    const declared = canonicalizeAgentList(patch.targets ?? []);
    if (declared.unknown.length) {
      throw new Error(
        `Patch declares unsupported targets: ${declared.unknown.join(", ")}. Load an adapter with --adapter <file> or edit the patch targets.`,
      );
    }

    const requestedAgents = preferredAgent
      ? canonicalizeAgentList([preferredAgent])
      : declared;
    if (requestedAgents.unknown.length) {
      throw new Error(
        `Unknown review agent: ${requestedAgents.unknown.join(", ")}. Registered adapters: ${listAgentDefinitions().map((item) => item.id).join(", ")}.`,
      );
    }

    const readyRunners = requestedAgents.agents
      .filter((agentId) => health.ready?.[agentId])
      .map((agentId) => createAgentRunner(agentId));

    const agentLabel =
      readyRunners.length > 1
        ? readyRunners.map((runner) => displayAgent(runner.id)).join(" + ")
        : readyRunners.length === 1
          ? displayAgent(readyRunners[0].id)
          : "no real agent";

    const result = await reviewPatch(
      store,
      patch,
      {
        async test(model, { onProgress }) {
          const specFile = model.specPath;
          if (!specFile) throw new Error("Behavior Spec missing.");

          const spec = await loadBehaviorSpec(specFile);
          if (spec.draft === true) {
            throw new Error(
              `Behavior Spec is still a draft: ${path.relative(repoRoot, specFile)}`,
            );
          }

          if (!readyRunners.length) {
            throw new Error(
              "No real evaluation agent is ready. Run `behavectl doctor`.",
            );
          }

          const verification = await verifyAcrossAgents({
            repoRoot,
            patch: model.patch,
            spec,
            runners: readyRunners,
            onProgress,
          });

          for (const evaluation of verification.evaluations) {
            await store.putEvaluation(evaluation);
          }

          if (verification.verdict === "promote") {
            await store.updatePatch(model.patch.id, (current) => ({
              ...current,
              status:
                current.status === "candidate"
                  ? "tested"
                  : current.status,
              verifiedAgents: verification.coverage.passing,
              verifiedAt: verification.createdAt,
            }));

            // Produce a durable proof automatically once real verification passes.
            await createBehaviorProof(store, model.patch.id);
          }

          return verification;
        },

        async promote(model) {
          return promotePatch(store, model.patch.id);
        },

        async reject(model) {
          return rejectPatch(store, model.patch.id);
        },
      },
      {
        agent: agentLabel,
        notice:
          !readyRunners.length
            ? "No declared Agent Adapter is ready. Run behavectl agents."
            : undefined,
      },
    );

    if (result?.output) console.log(result.output);

    if (result?.handoff === "edit-spec" && result.specPath) {
      console.log("Review the Behavior Spec:");
      console.log(`  ${path.relative(repoRoot, result.specPath)}`);
      console.log("");
      console.log('Set "draft": false when the test captures your intent, then:');
      console.log(
        `  behavectl review ${patch.id}${preferredAgent ? ` --agent ${preferredAgent}` : ""}`,
      );
    }

    return;
  }



  if (command === "replay") {
    const kind = args[1];

    if (kind === "bundle") {
      const dir = args[2];
      if (!dir) {
        throw new Error(
          "Usage: behavectl replay bundle <traces-dir>",
        );
      }

      const result = await replayTraceBundle(
        path.resolve(dir),
      );

      if (args.includes("--json")) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(
          formatProtocolBundleReplay(result),
        );
      }

      if (!result.healthy) {
        process.exitCode = 1;
      }
      return;
    }

    const replayAgent = canonicalAgentId(kind);
    const replayAdapter = replayAgent ? agentDefinition(replayAgent) : null;
    if (!replayAdapter || !replayAdapter.capabilities.includes("replay")) {
      const replayable = listAgentDefinitions()
        .filter((adapter) => adapter.capabilities.includes("replay"))
        .map((adapter) => adapter.id)
        .join(", ");
      throw new Error(
        `Usage: behavectl replay <agent> <trace.jsonl> [--json]. Replay-capable adapters: ${replayable}.`,
      );
    }

    const file = args[2];
    if (!file) {
      throw new Error(
        `Usage: behavectl replay ${replayAgent} <trace.jsonl> [--json]`,
      );
    }

    const result = await replayProtocolFile({
      agent: replayAgent,
      file: path.resolve(file),
    });

    if (args.includes("--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatProtocolReplay(result));
    }

    if (!result.protocolHealthy) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "log") {
    const limit = integerOption("--limit", 20, {
      min: 1,
      max: 200,
    });

    const entries = await buildBehaviorHistory(store, {
      limit,
    });

    if (args.includes("--json")) {
      console.log(JSON.stringify(entries, null, 2));
    } else {
      console.log(formatBehaviorHistory(entries));
    }
    return;
  }

  if (command === "patches") {
    const patches = await store.patches();
    if (!patches.length) {
      console.log("No Behavior Patches.");
      return;
    }
    for (const patch of patches) {
      console.log(
        `${patch.id.padEnd(24)} ${String(patch.status).padEnd(10)} ${patch.behavior.statement}`,
      );
    }
    return;
  }

  if (command === "show") {
    const id = args[1];
    if (!id) throw new Error("Usage: behavectl show <patch-id>");
    const patch = await store.patch(id);
    if (!patch) throw new Error(`Patch not found: ${id}`);
    console.log(JSON.stringify(patch, null, 2));
    return;
  }






  if (command === "rc") {
    if (args[1] === "inspect") {
      const dir = args[2];
      if (!dir) throw new Error("Usage: behavectl rc inspect <rc-or-shard-dir>");

      const target = path.resolve(dir);
      if (await pathExists(path.join(target, "RC_SHARD.json"))) {
        const assessment = await assessReleaseShard(target);
        if (args.includes("--json")) console.log(JSON.stringify(assessment, null, 2));
        else console.log(formatReleaseShard(assessment));
        if (assessment.verdict !== "valid") process.exitCode = 1;
        return;
      }

      const assessment = await assessReleaseCandidate(target);
      if (args.includes("--json")) console.log(JSON.stringify(assessment, null, 2));
      else console.log(formatReleaseCandidate(assessment));
      if (assessment.verdict !== "go") process.exitCode = 1;
      return;
    }

    if (args[1] === "merge") {
      const output = option("--out");
      const shardArgs = [];
      for (let index = 2; index < args.length; index += 1) {
        const value = args[index];
        if (["--out", "--adapter"].includes(value)) {
          index += 1;
          continue;
        }
        if (value.startsWith("--")) continue;
        shardArgs.push(value);
      }
      if (shardArgs.length < 2 || !output) {
        throw new Error(
          "Usage: behavectl rc merge <shard-a> <shard-b> [more-shards...] --out <rc-dir>",
        );
      }

      const merged = await mergeReleaseShards({
        shardDirs: shardArgs.map((value) => path.resolve(value)),
        outputDir: path.resolve(output),
      });
      console.log(formatReleaseCandidate(merged.assessment));
      console.log("");
      console.log(`Evidence bundle:\n  ${merged.outputDir}`);
      if (merged.assessment.verdict !== "go") process.exitCode = 1;
      return;
    }

    const repeat = integerOption("--repeat", 3, { min: 3, max: 10 });
    const outputDir = option("--out") ? path.resolve(option("--out")) : undefined;
    const artifactPath = option("--artifact") ? path.resolve(option("--artifact")) : undefined;
    const health = await doctor();

    const explicitAgents = [
      ...(option("--agents")?.split(",") ?? []),
      ...options("--agent"),
    ].map((value) => value.trim()).filter(Boolean);

    const readyCertifiable = (health.agents ?? [])
      .filter((agent) => health.ready?.[agent.id])
      .filter((agent) => {
        const definition = agentDefinition(agent.id);
        return definition?.capabilities.includes("evaluate") && definition?.capabilities.includes("replay");
      })
      .map((agent) => agent.id);

    const profileInput = option("--profile")
      ? option("--profile").split(",").map((value) => value.trim()).filter(Boolean)
      : explicitAgents.length
        ? explicitAgents
        : readyCertifiable;

    const profile = canonicalizeAgentList(profileInput);
    if (profile.unknown.length) {
      throw new Error(
        `Unknown certification profile adapters: ${profile.unknown.join(", ")}. Load a community adapter with --adapter <file> first.`,
      );
    }
    if (!profile.agents.length) {
      throw new Error(
        "No certifiable Agent Adapter is ready. Use `behavectl agents`, then choose `behavectl rc --agents <a,b> --yes`.",
      );
    }
    for (const id of profile.agents) {
      const definition = agentDefinition(id);
      if (!definition?.capabilities.includes("evaluate") || !definition?.capabilities.includes("replay")) {
        throw new Error(
          `Adapter ${id} cannot enter an RC certification profile until it supports evaluate + replay.`,
        );
      }
    }

    // Artifact + exactly one explicit --agent means this machine is producing
    // one portable shard for a larger certification profile.
    const shardAgentValues = options("--agent");
    if (artifactPath && shardAgentValues.length === 1) {
      const shardResolved = canonicalizeAgentList(shardAgentValues);
      const agent = shardResolved.agents[0];
      if (!agent) throw new Error(`Unknown shard adapter: ${shardAgentValues[0]}`);
      const shardProfile = option("--profile")
        ? canonicalizeAgentList(option("--profile").split(",")).agents
        : profile.agents;

      const preflight = await livePreflight({ repeat, agents: [agent] });
      console.log("BEHAVECTL");
      console.log(`RC shard · ${displayAgent(agent)}`);
      console.log(`Profile  · ${shardProfile.map(displayAgent).join(" + ")}`);
      console.log("");
      console.log(formatLivePreflight(preflight).split("\n").slice(3).join("\n"));
      if (!preflight.ready) {
        throw Object.assign(
          new Error(`RC shard blocked. Missing: ${preflight.missing.join(", ")}.`),
          { code: "BCTL_RC_PREFLIGHT_FAILED" },
        );
      }

      console.log("");
      console.log(`This machine will run only ${displayAgent(agent)}: ${preflight.plannedAgentInvocations} real agent jobs.`);
      console.log("Other profile members may run on other machines; merge is offline.");

      let approved = args.includes("--yes");
      if (!approved && process.stdin.isTTY && process.stdout.isTTY) {
        approved = await confirm(`Run ${displayAgent(agent)} RC shard now? [y/N] `);
      }
      if (!approved) {
        console.log(`\nNot started. Re-run with --yes.`);
        return;
      }

      const shard = await runReleaseShard({
        agent,
        profile: shardProfile,
        repeat,
        outputDir,
        artifactPath,
        onProgress: async (event) => {
          if (event.phase === "challenge" && event.state === "done") console.log("✓ fresh deterministic challenge");
          if (event.phase === "agent" && event.state === "running" && event.agent) {
            console.log(`→ ${displayAgent(event.agent)} · trial ${event.trial}/${event.repeat}`);
          }
        },
      });
      console.log("\n" + formatReleaseShard(shard.assessment));
      console.log(`\nShard bundle:\n  ${shard.live.outputDir}`);
      if (shard.assessment.verdict !== "valid") process.exitCode = 1;
      return;
    }

    const preflight = await livePreflight({ repeat, agents: profile.agents });
    console.log("BEHAVECTL");
    console.log("Release Candidate · certification profile");
    console.log(`Profile  · ${profile.agents.map(displayAgent).join(" + ")}`);
    console.log("");
    console.log(formatLivePreflight(preflight).split("\n").slice(3).join("\n"));

    if (!preflight.ready) {
      throw Object.assign(
        new Error(
          `RC profile blocked. Missing: ${preflight.missing.join(", ")}. Only the declared certification profile is required.`,
        ),
        { code: "BCTL_RC_PREFLIGHT_FAILED" },
      );
    }

    console.log("");
    console.log(`This will run ${preflight.plannedAgentInvocations} real agent jobs across the declared profile.`);

    let approved = args.includes("--yes");
    if (!approved && process.stdin.isTTY && process.stdout.isTTY) {
      approved = await confirm("Run this RC certification profile now? [y/N] ");
    }
    if (!approved) {
      console.log("\nNot started. Re-run with `behavectl rc --yes`.");
      return;
    }

    const rc = await runReleaseCandidate({
      repeat,
      outputDir,
      artifactPath,
      agents: profile.agents,
      onProgress: async (event) => {
        if (event.phase === "challenge" && event.state === "done") console.log("✓ fresh deterministic challenge");
        if (event.phase === "agent" && event.state === "running" && event.agent) {
          console.log(`→ ${displayAgent(event.agent)} · trial ${event.trial}/${event.repeat}`);
        }
      },
    });
    console.log("\n" + formatReleaseCandidate(rc.assessment));
    console.log(`\nEvidence bundle:\n  ${rc.live.outputDir}`);
    if (rc.assessment.verdict !== "go") process.exitCode = 1;
    return;
  }

  if (command === "ci") {
    if (args[1] === "init") {
      const pkg = JSON.parse(
        await fs.readFile(
          new URL("../../package.json", import.meta.url),
          "utf8",
        ),
      );

      const result = await installBehaviorCI({
        repoRoot,
        version: pkg.version,
      });

      console.log("Behavectl Behavior CI");
      console.log("");
      console.log(
        `${result.changed ? "✓" : "·"} GitHub workflow  ${path.relative(repoRoot, result.workflowFile)}`,
      );
      console.log("");
      console.log("Behavior-changing PRs will now require intact passing Behavior Proofs.");
      console.log("No model-provider credentials are required in CI.");
      return;
    }

    const baseRef =
      option("--base") ??
      process.env.BEHAVECTL_BASE_SHA;

    if (!baseRef) {
      throw new Error(
        "Usage: behavectl ci --base <git-sha-or-ref> [--proof <proof-dir>]",
      );
    }

    const headRef = option("--head") ?? "HEAD";
    const proofDir = option("--proof");

    const result = await evaluateBehaviorCI({
      repoRoot,
      baseRef,
      headRef,
      proofDir,
    });

    if (args.includes("--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatBehaviorCI(result));
    }

    const summaryFile =
      option("--summary") ??
      process.env.GITHUB_STEP_SUMMARY;

    if (summaryFile) {
      await fs.appendFile(
        path.resolve(summaryFile),
        renderBehaviorCIMarkdown(result) + "\n",
        "utf8",
      );
    }

    if (result.status !== "pass") {
      process.exitCode = 1;
    }

    return;
  }

  if (command === "live") {
    const repeat = integerOption("--repeat", 3, {
      min: 1,
      max: 10,
    });

    const outputDir = option("--out")
      ? path.resolve(option("--out"))
      : undefined;

    const health = await doctor();
    const explicitValues = [
      ...(option("--agents")?.split(",") ?? []),
      ...options("--agent"),
    ].map((value) => value.trim()).filter(Boolean);

    const readyCertifiable = (health.agents ?? [])
      .filter((agent) => health.ready?.[agent.id])
      .filter((agent) => {
        const adapter = agentDefinition(agent.id);
        return adapter?.capabilities.includes("evaluate") && adapter?.capabilities.includes("replay");
      })
      .map((agent) => agent.id);

    const selected = canonicalizeAgentList(explicitValues.length ? explicitValues : readyCertifiable);
    if (selected.unknown.length) {
      throw new Error(
        `Unknown live-validation adapters: ${selected.unknown.join(", ")}. Load a community adapter with --adapter <file> first.`,
      );
    }
    if (!selected.agents.length) {
      throw new Error(
        "No live-validation Agent Adapter is ready. Run `behavectl agents`, or pass `--agents <a,b>` after loading an adapter.",
      );
    }
    for (const id of selected.agents) {
      const adapter = agentDefinition(id);
      if (!adapter?.capabilities.includes("evaluate") || !adapter?.capabilities.includes("replay")) {
        throw new Error(
          `Adapter ${id} cannot enter live validation until it supports evaluate + replay.`,
        );
      }
    }

    const preflight = await livePreflight({ repeat, agents: selected.agents, doctorFn: async () => health });
    console.log(formatLivePreflight(preflight));

    if (!preflight.ready) {
      throw Object.assign(
        new Error(
          `Live validation blocked. Missing: ${preflight.missing.join(", ")}.`,
        ),
        { code: "BCTL_LIVE_PREFLIGHT_FAILED" },
      );
    }

    console.log("");
    console.log(
      `This will run ${preflight.plannedAgentInvocations} real agent jobs.`,
    );
    console.log("The challenge repo is synthetic; no user project code is sent.");

    let approved = args.includes("--yes");

    if (!approved && process.stdin.isTTY && process.stdout.isTTY) {
      approved = await confirm(
        `Run live validation now? [y/N] `,
      );
    }

    if (!approved) {
      console.log("");
      console.log(
        `Not started. Re-run with \`behavectl live --agents ${selected.agents.join(",")} --yes\` for non-interactive use.`,
      );
      return;
    }

    console.log("");
    console.log("Running live validation…");

    try {
      const live = await runLiveValidation({
        repeat,
        outputDir,
        agents: selected.agents,
        targets: selected.agents,
        doctorFn: async () => health,
        onProgress: async (event) => {
          if (event.phase === "challenge" && event.state === "done") {
            console.log("✓ fresh deterministic challenge");
          }

          if (
            event.phase === "agent" &&
            event.state === "running" &&
            event.agent
          ) {
            console.log(
              `→ ${displayAgent(event.agent)} · trial ${event.trial}/${event.repeat}`,
            );
          }
        },
      });

      console.log("");
      console.log(formatBehaviorMatrix(live.verification));
      console.log("");
      console.log("LIVE PROOF READY");
      console.log(`  ${live.outputDir}`);
      console.log("");
      console.log("Open:");
      console.log(`  ${path.join(live.outputDir, "LIVE_VALIDATION.md")}`);
      console.log(`  ${path.join(live.outputDir, "proof", "PROOF.md")}`);
    } catch (error) {
      console.log("");
      console.error(
        renderCliError(
          error,
          {
            context:
              "Live validation",
          },
        ),
      );
      process.exitCode = 1;
    }

    return;
  }

  if (command === "adapter") {
    const action = args[1] ?? "list";

    if (action === "list") {
      console.log("BEHAVECTL · Adapter SDK");
      console.log("");
      for (const adapter of listAgentDefinitions()) {
        console.log(`● ${adapter.displayName.padEnd(18)} ${adapter.id.padEnd(14)} ${adapter.maturity}`);
        console.log(`  contract     ${adapter.contractVersion}`);
        console.log(`  capabilities ${adapter.capabilities.join(" · ")}`);
        console.log(`  source       ${adapter.source ?? "builtin"}`);
      }
      console.log("");
      console.log("Build one adapter. Keep core untouched.");
      return;
    }

    if (action === "inspect") {
      const id = args[2];
      if (!id) throw new Error("Usage: behavectl adapter inspect <agent-id>");
      const adapter = agentDefinition(id);
      if (!adapter) {
        throw new Error(`Adapter not registered: ${id}`);
      }
      const detected = await (await import("../adapters/sdk.mjs")).detectAdapter(adapter);
      const payload = {
        id: adapter.id,
        displayName: adapter.displayName,
        contractVersion: adapter.contractVersion,
        maturity: adapter.maturity,
        aliases: adapter.aliases,
        binaries: adapter.binaries,
        capabilities: adapter.capabilities,
        protocol: adapter.protocol,
        surfaces: adapter.surfaces,
        source: adapter.source ?? "builtin",
        detected,
      };
      if (args.includes("--json")) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.log(`BEHAVECTL · Adapter · ${adapter.displayName}`);
        console.log("");
        console.log(`id            ${adapter.id}`);
        console.log(`contract      ${adapter.contractVersion}`);
        console.log(`maturity      ${adapter.maturity}`);
        console.log(`capabilities  ${adapter.capabilities.join(" · ")}`);
        console.log(`protocol      ${adapter.protocol ?? "adapter-defined"}`);
        console.log(`surfaces      ${adapter.surfaces.length ? adapter.surfaces.join(" · ") : "none"}`);
        console.log(`source        ${adapter.source ?? "builtin"}`);
        console.log(`runtime       ${detected.installed ? `${detected.command} · ${detected.version}` : "not detected"}`);
      }
      return;
    }

    if (action === "check") {
      const file = args[2];
      if (!file) throw new Error("Usage: behavectl adapter check <adapter.mjs>");
      const adapter = await registerExternalAdapter(path.resolve(file), { replace: args.includes("--replace") });
      const detected = await (await import("../adapters/sdk.mjs")).detectAdapter(adapter);
      console.log("BEHAVECTL · Adapter Contract");
      console.log("");
      console.log(`✓ contract      ${adapter.contractVersion}`);
      console.log(`✓ identity      ${adapter.id} · ${adapter.displayName}`);
      console.log(`✓ maturity      ${adapter.maturity}`);
      console.log(`✓ capabilities  ${adapter.capabilities.join(" · ")}`);
      console.log(`✓ runtime       ${detected.installed ? `${detected.command} · ${detected.version}` : "not detected (contract still valid)"}`);
      console.log("");
      console.log("ADAPTER: VALID");
      return;
    }

    if (action === "scaffold") {
      const id = args[2];
      if (!id) throw new Error("Usage: behavectl adapter scaffold <agent-id> [--out <dir>]");
      const output = path.resolve(option("--out") ?? path.join(process.cwd(), `behavectl-adapter-${id}`));
      const result = await writeAdapterScaffold(id, output);
      console.log("BEHAVECTL · Adapter Scaffold");
      console.log("");
      console.log(`✓ ${result.adapterFile}`);
      console.log(`✓ ${result.testFile}`);
      console.log(`✓ ${result.readmeFile}`);
      console.log("");
      console.log("Next");
      console.log(`  behavectl adapter check ${shellDisplayPath(result.adapterFile)}`);
      return;
    }

    throw new Error("Usage: behavectl adapter list|inspect|check|scaffold");
  }

  if (command === "agents") {
    const report = await doctor();
    if (args.includes("--json")) {
      console.log(JSON.stringify(report.agents ?? [], null, 2));
      return;
    }

    console.log("BEHAVECTL · Agent Registry");
    console.log("");
    for (const agent of report.agents ?? []) {
      const ready = report.ready?.[agent.id];
      const mark = ready ? "●" : agent.installed ? "▲" : "○";
      const state = ready
        ? "DETECTED"
        : agent.installed
          ? "INSTALLED"
          : "NOT DETECTED";
      console.log(`${mark} ${agent.displayName.padEnd(18)} ${state.padEnd(12)} ${agent.maturity ?? ""}`);
      if (agent.installed) {
        console.log(`  ${agent.command} · ${agent.version ?? "version unknown"}`);
      }
      console.log(`  ${agent.capabilities?.join(" · ") ?? ""}`);
    }
    console.log("");
    console.log("Declared targets are opt-in. Behavectl never requires every supported agent.");
    console.log("Detection checks local binaries only. Authentication and model access are not checked.");
    return;
  }

  if (command === "doctor") {
    const report = await doctor();

    if (args.includes("--json")) {
      console.log(
        JSON.stringify(
          report,
          null,
          2,
        ),
      );
    } else {
      console.log(
        renderDoctorSurface(report),
      );
    }
    return;
  }

  if (command === "demo") {
    if (args[1] === "create") {
      const target =
        args[2] && !args[2].startsWith("--")
          ? path.resolve(args[2])
          : path.resolve(process.cwd(), "behavectl-killer-demo");

      const rawTargets = [
        ...(option("--agents")?.split(",") ?? []),
        ...options("--agent"),
      ].map((value) => value.trim()).filter(Boolean);
      const resolved = canonicalizeAgentList(rawTargets.length ? rawTargets : ["codex", "codebuddy"]);
      if (resolved.unknown.length) {
        throw new Error(`Unknown demo agents: ${resolved.unknown.join(", ")}. Supported: ${listAgentDefinitions().map((item) => item.id).join(", ")}.`);
      }

      const demo = await createKillerDemoRepo(target, { targets: resolved.agents });

      console.log("Behavectl Killer Demo");
      console.log("");
      console.log(`✓ repository   ${demo.repoRoot}`);
      console.log(`✓ patch        ${KILLER_DEMO_PATCH_ID}`);
      console.log("✓ spec         deterministic / reviewed");
      console.log("✓ network      not required by demo repo");
      console.log(`✓ targets      ${demo.patch.targets.map(displayAgent).join(" + ")}`);
      console.log("");
      console.log("Task");
      console.log(`  ${demo.task}`);
      console.log("");
      console.log("Next");
      console.log(`  cd ${shellDisplayPath(demo.repoRoot)}`);
      console.log("  behavectl doctor");
      console.log(`  behavectl verify ${KILLER_DEMO_PATCH_ID} --repeat 3`);
      return;
    }

    const demoRepo = await createDemoRepo();
    const patch = {
      schema: "behavectl.behavior-patch.v1",
      id: "bp_demo_pnpm",
      version: 1,
      source: { kind: "demo" },
      scope: { kind: "project" },
      behavior: {
        statement: "Always use pnpm for dependency operations. Never use npm.",
      },
      evidence: [],
      risk: "L1",
      targets: ["claude-code", "codex"],
      status: "candidate",
      createdAt: new Date().toISOString(),
    };

    const spec = {
      schema: "behavectl.behavior-spec.v1",
      id: "demo-pnpm",
      task: "Add zod as a dependency.",
      checks: [
        {
          id: "uses-pnpm",
          label: "Uses pnpm",
          kind: "command_matches",
          value: "pnpm\\s+add\\s+zod",
        },
        {
          id: "avoids-npm",
          label: "Avoids npm",
          kind: "command_not_matches",
          value: "npm\\s+install",
        },
        {
          id: "no-package-lock",
          label: "No package-lock.json",
          kind: "file_not_exists",
          value: "package-lock.json",
        },
      ],
    };

    const runner = new FixtureRunner(async ({ workspace, patch: candidate }) => {
      if (candidate) {
        return {
          commands: ["pnpm add zod"],
          output: "fixture candidate",
          exitCode: 0,
        };
      }

      await fs.writeFile(path.join(workspace, "package-lock.json"), "{}");
      return {
        commands: ["npm install zod"],
        output: "fixture baseline",
        exitCode: 0,
      };
    });

    const evaluation = await evaluateBehaviorPatch({
      repoRoot: demoRepo,
      patch,
      spec,
      runner,
    });

    console.log(
      renderProductTour({
        evaluation,
      }),
    );
    return;
  }


  if (command === "spec") {
    const id = args[1];
    if (!id) throw new Error("Usage: behavectl spec <patch-id>");
    const patch = await store.patch(id);
    if (!patch) throw new Error(`Patch not found: ${id}`);

    const { spec, file } = await writeSuggestedSpec(store, patch);

    console.log(`Behavior Spec draft · ${spec.id}`);
    console.log("");
    console.log(spec.rationale);
    console.log("");
    if (spec.task) console.log(`Task   ${spec.task}`);
    if (spec.checks.length) {
      console.log("Checks");
      for (const check of spec.checks) {
        console.log(`  ○ ${check.label}`);
      }
    } else {
      console.log("Checks  none — edit the draft before testing");
    }
    console.log("");
    console.log(`Saved  ${path.relative(repoRoot, file)}`);
    console.log("Review/edit the draft, then run:");
    console.log(`  behavectl test ${id} --agent claude`);
    return;
  }


  if (command === "verify") {
    const id = args[1];
    if (!id) {
      throw new Error("Usage: behavectl verify <patch-id> [--agent codex --agent codebuddy] [--repeat 3]");
    }

    const patch = await store.patch(id);
    if (!patch) throw new Error(`Patch not found: ${id}`);

    const explicitSpec = option("--spec");
    const specFile = explicitSpec ?? (await defaultSpecPath(store, id));
    if (!specFile) {
      throw new Error(`No Behavior Spec found. Run \`behavectl spec ${id}\` first.`);
    }

    const spec = await loadBehaviorSpec(specFile);
    if (spec.draft === true && !args.includes("--accept-draft-spec")) {
      throw new Error(
        `Behavior Spec is still marked draft. Review ${path.relative(repoRoot, specFile)}, set "draft": false, then rerun.`,
      );
    }

    const explicitValues = [
      ...(option("--agents")?.split(",") ?? []),
      ...options("--agent"),
    ].map((value) => value.trim()).filter(Boolean);

    const declared = canonicalizeAgentList(patch.targets ?? []);
    if (declared.unknown.length) {
      throw new Error(
        `Patch declares unsupported targets: ${declared.unknown.join(", ")}. Install an adapter or edit the patch targets.`,
      );
    }

    const requested = canonicalizeAgentList(explicitValues.length ? explicitValues : declared.agents);
    if (requested.unknown.length) {
      throw new Error(
        `Unknown agents: ${requested.unknown.join(", ")}. Supported adapters: ${listAgentDefinitions().map((item) => item.id).join(", ")}.`,
      );
    }
    if (!requested.agents.length) {
      throw new Error(
        `Patch ${id} declares no supported targets. Add at least one target such as codex or codebuddy.`,
      );
    }

    const repeat = integerOption("--repeat", 1, { min: 1, max: 10 });
    const health = await doctor();
    const healthById = new Map((health.agents ?? []).map((item) => [item.id, item]));
    const unavailable = requested.agents.filter((agentId) => !health.ready?.[agentId]);
    if (unavailable.length) {
      throw new Error(
        `Real evaluation unavailable for: ${unavailable.map(displayAgent).join(", ")}. Run \`behavectl agents\` to inspect local adapters.`,
      );
    }

    const runners = requested.agents.map((agentId) => createAgentRunner(agentId));
    console.log(
      `Verifying ${id} · ${requested.agents.map(displayAgent).join(" + ")} · ${repeat} trial${repeat === 1 ? "" : "s"} each...`,
    );
    console.log("");

    const verification = await verifyAcrossAgents({
      repoRoot,
      patch,
      spec,
      runners,
      repeat,
      onProgress: async (event) => {
        if (event.phase === "agent" && event.state === "running") {
          const trial = event.repeat > 1 ? ` · trial ${event.trial}/${event.repeat}` : "";
          console.log(`→ ${displayAgent(event.agent)}${trial}`);
        }
      },
    });

    for (const evaluation of verification.evaluations) {
      await store.putEvaluation(evaluation);
    }
    await store.putVerification(verification);

    if (verification.verdict === "promote") {
      await store.updatePatch(id, (current) => ({
        ...current,
        status: current.status === "candidate" ? "tested" : current.status,
        verifiedAgents: verification.coverage.passing,
        verifiedAt: verification.createdAt,
        lastVerificationId: verification.id,
        stabilityTrials: repeat,
      }));
    }

    console.log("");
    console.log(formatBehaviorMatrix(verification));

    if (verification.verdict === "promote") {
      const proof = await createBehaviorProof(store, id);
      console.log("");
      console.log(`Proof: ${path.relative(repoRoot, proof.dir)}/PROOF.md`);
    } else {
      console.log("");
      console.log("Proof not emitted: every declared target must pass every required trial.");
    }
    return;
  }

  if (command === "test") {
    const id = args[1];
    if (!id) throw new Error("Usage: behavectl test <patch-id> --spec <spec.json> --agent claude|codex");

    const patch = await store.patch(id);
    if (!patch) throw new Error(`Patch not found: ${id}`);

    const explicitSpec = option("--spec");
    const agent = canonicalAgentId(option("--agent") ?? patch.targets?.[0]);
    if (!agent) {
      throw new Error(
        `Choose a supported agent with --agent. Supported adapters: ${listAgentDefinitions().map((item) => item.id).join(", ")}.`,
      );
    }
    const specFile =
      explicitSpec ?? (await defaultSpecPath(store, id));

    if (!specFile) {
      throw new Error(
        `No Behavior Spec found. Run \`behavectl spec ${id}\` or pass --spec <spec.json>.`,
      );
    }

    const spec = await loadBehaviorSpec(specFile);

    if (spec.draft === true && !args.includes("--accept-draft-spec")) {
      throw new Error(
        `Behavior Spec is still marked draft. Review ${path.relative(repoRoot, specFile)}, set "draft": false, then rerun.`,
      );
    }

    const runner = createAgentRunner(agent);
    if (!(await runner.available())) {
      throw new Error(
        `${displayAgent(agent)} is not available on this machine. Run \`behavectl agents\`.`,
      );
    }

    const evaluation = await evaluateBehaviorPatch({
      repoRoot,
      patch,
      spec,
      runner,
    });

    await store.putEvaluation(evaluation);

    const verification = buildVerificationRecord({
      patch,
      spec,
      evaluations: [evaluation],
      repeat: 1,
    });
    await store.putVerification(verification);

    if (evaluation.verdict === "promote") {
      await store.updatePatch(id, (current) => ({
        ...current,
        status: current.status === "candidate" ? "tested" : current.status,
        lastEvaluationId: evaluation.id,
        lastVerificationId: verification.id,
      }));
    }

    console.log(formatBehaviorDiff(evaluation));

    if (verification.coverage.missingTargets.length) {
      console.log("");
      console.log(
        `Promotion still requires: ${verification.coverage.missingTargets.map(displayAgent).join(", ")}`,
      );
    }
    return;
  }


  if (command === "proof") {
    if (args[1] === "verify") {
      const target = args[2];
      if (!target) {
        throw new Error("Usage: behavectl proof verify <proof-dir>");
      }

      const validation =
        await validateBehaviorProof(
          path.resolve(target),
        );
      console.log(
        formatBehaviorProofValidation(
          validation,
        ),
      );
      if (!validation.valid) {
        process.exitCode = 1;
      }
      return;
    }

    const id = args[1];
    if (!id) throw new Error("Usage: behavectl proof <patch-id>");

    const result = await createBehaviorProof(store, id);
    console.log("Behavectl Behavior Proof");
    console.log("");
    console.log(`✓ patch       ${id}`);
    console.log(`✓ agents      ${result.manifest.runners.join(", ")}`);
    console.log(`✓ coverage    ${result.manifest.coverage.passed}/${result.manifest.coverage.total}`);
    console.log(`✓ verdict     ${String(result.manifest.verdict).toUpperCase()}`);
    console.log("");
    console.log(`Saved ${path.relative(repoRoot, result.dir)}/`);
    console.log("  PROOF.md");
    if (result.manifest.files.matrix) console.log("  behavior-matrix.txt");
    console.log("  evaluations/");
    console.log("  diffs/");
    console.log("  patch.json");
    console.log("  verification.json");
    console.log("  manifest.json");
    console.log("  checksums.json");
    return;
  }

  if (command === "diff") {
    const id = args[1];
    if (!id) throw new Error("Usage: behavectl diff <patch-id>");
    const patch = await store.patch(id);
    if (!patch) throw new Error(`Patch not found: ${id}`);

    console.log(`Behavior Patch · ${patch.id}`);
    console.log("");
    console.log(`Status   ${patch.status}`);
    console.log(`Scope    ${patch.scope.kind}`);
    console.log(`Risk     ${patch.risk}`);
    console.log(`Source   ${patch.source.sourceAgent ?? patch.source.kind}`);
    console.log("");
    console.log("Proposed behavior");
    console.log(`+ ${patch.behavior.statement}`);
    console.log("");
    console.log(`Evidence ${patch.evidence.length}`);
    for (const item of patch.evidence) {
      if (item.kind === "repo_file") console.log(`  ✓ ${item.path}: ${item.fact}`);
      else if (item.kind === "package_metadata") console.log(`  ✓ ${item.key}: ${item.value}`);
      else if (item.kind === "user_correction") console.log(`  ✓ explicit user correction (${item.confidence})`);
      else console.log(`  ✓ ${item.kind}`);
    }
    return;
  }

  if (command === "promote") {
    const id = args[1];
    if (!id) throw new Error("Usage: behavectl promote <patch-id>");
    if (args.includes("--force")) {
      throw new Error(
        "`--force` is not available from the public CLI. Promotion requires a current real Verification Run.",
      );
    }
    const result = await promotePatch(store, id);
    console.log(result.changed ? `✓ ${id} promoted` : `✓ ${id} already active`);
    for (const artifact of result.artifacts.filter((item) => item.count > 0)) {
      console.log(`  ${artifact.adapter.padEnd(12)} → ${artifact.path}`);
    }
    return;
  }

  if (command === "rollback") {
    const id = args[1];
    if (!id) throw new Error("Usage: behavectl rollback <patch-id>");
    const result = await rollbackPatch(store, id);
    console.log(`✓ ${id} rolled back`);
    for (const artifact of result.artifacts) {
      console.log(`  ${artifact.adapter.padEnd(12)} → ${artifact.path}`);
    }
    return;
  }

  if (command === "status") {
    const health = await doctor();
    const model = await buildHomeModel({
      store,
      repoRoot,
      health,
    });
    console.log(renderHome(model, { plain: true }));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}


async function loadExternalAdaptersFromArgs() {
  const files = [...new Set(options("--adapter").map((value) => path.resolve(value)))];
  for (const file of files) {
    await registerExternalAdapter(file);
  }
}

async function writeAdapterScaffold(id, outputDir) {
  const normalized = String(id).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) {
    throw new Error("Adapter id must be lowercase kebab-case.");
  }

  await fs.mkdir(outputDir, { recursive: true });
  const adapterFile = path.join(outputDir, "adapter.mjs");
  const testFile = path.join(outputDir, "adapter.test.mjs");
  const readmeFile = path.join(outputDir, "README.md");

  const displayName = normalized
    .split("-")
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(" ");

  await fs.writeFile(
    adapterFile,
    `import { defineAgentAdapter } from "behavectl/adapter-sdk";\n\nclass ${safeClassName(displayName)}Runner {\n  constructor(options = {}) {\n    this.id = ${JSON.stringify(normalized)};\n    this.options = options;\n  }\n\n  async available() {\n    return true; // TODO: detect the native runtime.\n  }\n\n  async run({ workspace, task, patch }) {\n    void workspace;\n    void task;\n    void patch;\n    throw new Error("TODO: invoke the native agent and return normalized commands/output/metadata.");\n  }\n}\n\nexport default defineAgentAdapter({\n  id: ${JSON.stringify(normalized)},\n  displayName: ${JSON.stringify(displayName)},\n  aliases: [${JSON.stringify(normalized)}],\n  binaries: [${JSON.stringify(normalized)}],\n  maturity: "experimental",\n  capabilities: ["evaluate"],\n  protocol: ${JSON.stringify(`behavectl.${normalized}.v1`)},\n  surfaces: [],\n  createRunner(options = {}) {\n    return new ${safeClassName(displayName)}Runner(options);\n  },\n});\n`,
    "utf8",
  );

  await fs.writeFile(
    testFile,
    `import test from "node:test";\nimport assert from "node:assert/strict";\nimport adapter from "./adapter.mjs";\n\ntest("${normalized} satisfies the Behavectl adapter contract", () => {\n  assert.equal(adapter.id, ${JSON.stringify(normalized)});\n  assert.equal(adapter.contractVersion, "behavectl.agent-adapter.v1");\n  assert.ok(adapter.capabilities.includes("evaluate"));\n  assert.equal(typeof adapter.createRunner, "function");\n});\n`,
    "utf8",
  );

  await fs.writeFile(
    readmeFile,
    `# Behavectl Adapter · ${displayName}\n\nThis scaffold is intentionally small. Behavectl Core should not change when a new Agent Adapter is added.\n\n## Contract\n\n1. Detect or name the native runtime.\n2. Run one isolated task through the native agent.\n3. Normalize the result into Behavectl's evaluation contract.\n4. Optionally compile promoted behavior into the agent's native persistent surface.\n\n## Check\n\n\`\`\`bash\nnode --test adapter.test.mjs\nbehavectl adapter check ./adapter.mjs\nbehavectl agents --adapter ./adapter.mjs\n\`\`\`\n\nThen target the adapter explicitly from a Behavior Patch. Declared targets are the only targets Behavectl requires.\n`,
    "utf8",
  );

  return { adapterFile, testFile, readmeFile };
}

function safeClassName(value) {
  const name = String(value).replace(/[^A-Za-z0-9]+/g, "");
  return /^[A-Za-z_$]/.test(name) ? name : `Agent${name}`;
}

async function packageVersion() {
  const pkg = JSON.parse(
    await fs.readFile(
      new URL(
        "../../package.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  return pkg.version;
}

function printHelp() {
  console.log(`Behavectl — Git for AI behavior

Usage:
  behavectl diagnose [--json] [--propose <finding-id>]  Inspect local evidence
  behavectl studio [--port 4317]  Open the local visual workbench
  behavectl                   Show the context-aware home screen
  behavectl init [--claude|--codex|--all] [--mcp]
                       Auto-detect agents, install hooks, and install Agent Skills
  behavectl agent install [--claude|--codex|--all] [--mcp]
                       Install the Behavectl skill directly into coding agents
  behavectl agent status
                       Show Agent Skill / MCP integration state
  behavectl agent uninstall
                       Remove Behavectl Agent Skills without touching behavior history
  behavectl mcp              Run the read-only stdio MCP server
  behavectl uninstall        Remove Behavectl hooks without deleting history
  behavectl agents [--json] [--adapter ./adapter.mjs]
                       Detect built-in + explicitly loaded Agent Adapters
  behavectl adapter list
                       Show the Adapter SDK registry
  behavectl adapter inspect <id>
                       Inspect one adapter contract, runtime, protocol, and surfaces
  behavectl adapter check <adapter.mjs>
                       Validate a community adapter without changing Behavectl Core
  behavectl adapter scaffold <id> [--out <dir>]
                       Generate a minimal community adapter starter
  behavectl doctor [--json]  Check runtime and Agent Adapter readiness
  behavectl ci init          Install GitHub Behavior CI
  behavectl ci --base <ref>  Gate behavior-changing diffs on a valid Behavior Proof
  behavectl demo             Run the 30-second simulated product tour
  behavectl demo create [dir] [--agents codex,codebuddy]
                       Create a deterministic cross-agent killer-demo repository
  behavectl hook claude       Read a Claude Code hook payload from stdin
  behavectl hook codex        Read a Codex hook payload from stdin
  behavectl learn             Turn high-confidence corrections into Behavior Patches
  behavectl inbox             List behavior changes waiting for review
  behavectl review [id]       Open the review experience (or --plain for snapshot)
  behavectl log [--limit 20]  Show behavior change history and proof state
  behavectl patches           List Behavior Patches
  behavectl show <id>         Show one Behavior Patch
  behavectl diff <id>         Explain a proposed behavior change
  behavectl proof <id>        Export a shareable Behavior Proof from a real eval
  behavectl proof verify <dir>
                       Verify byte integrity + semantic binding of a copied Behavior Proof
  behavectl spec <id>         Suggest an editable deterministic Behavior Spec
  behavectl verify <id>      Verify every declared Behavior Patch target
                       Use --agent repeatedly to select a subset; --repeat 3 for stability
                       Use --adapter ./adapter.mjs to load an explicit community adapter
  behavectl test <id> --spec <file> --agent <adapter>
                       Run a real isolated before/after Behavior Diff
  behavectl live --agents codex,codebuddy --yes
                       Run real live validation for the selected Agent Adapter set
  behavectl replay <agent> <trace.jsonl>
                       Replay any registered replay-capable Agent Adapter protocol
  behavectl rc --agents codex,codebuddy --artifact <tgz> --yes
                       Certify a local profile and bind the exact publish artifact
  behavectl rc --agent codex --profile codex,codebuddy --artifact <tgz> --yes
                       Produce one artifact-bound shard for a distributed profile
  behavectl rc merge <shard-a> <shard-b> [more...] --out <dir>
                       Merge profile shards offline; no Agent runtime required
  behavectl promote <id>      Promote only after a passing real Behavior Diff
  behavectl rollback <id>     Retire a patch and regenerate managed behavior
  behavectl status            Show local status
  behavectl version           Print Behavectl version
`);
}

async function confirm(question) {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(question);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function readStdin() {
  let out = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) out += chunk;
  return out;
}

async function pathExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function createDemoRepo() {
  const os = await import("node:os");
  const demoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "behavectl-demo-"));
  await fs.writeFile(
    path.join(demoRoot, "package.json"),
    JSON.stringify({ name: "behavectl-demo" }, null, 2),
  );
  return demoRoot;
}

function shellDisplayPath(value) {
  return /\s/.test(value)
    ? JSON.stringify(value)
    : value;
}

function displayAgent(id) {
  return displayAgentName(id);
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function options(name) {
  const values = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === name && args[index + 1] !== undefined) {
      values.push(args[index + 1]);
      index += 1;
    }
  }
  return values;
}

function integerOption(name, fallback, { min, max }) {
  const raw = option(name);
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(
      `${name} must be an integer between ${min} and ${max}.`,
    );
  }

  return value;
}

function findRepoRoot(start) {
  // Phase 1 deliberately keeps this cheap and dependency-free.
  // We walk upward for .git and otherwise use the current directory.
  let cur = path.resolve(start);
  while (true) {
    try {
      const stat = requireStatSync(path.join(cur, ".git"));
      if (stat) return cur;
    } catch {}
    const parent = path.dirname(cur);
    if (parent === cur) return path.resolve(start);
    cur = parent;
  }
}

function requireStatSync(file) {
  try {
    // Avoid importing node:fs twice into hot hook path.
    return globalThis.__behavectlFs?.statSync?.(file) ?? null;
  } catch {
    return null;
  }
}

// Initialize tiny synchronous stat shim once.
const fsSync = await import("node:fs");
globalThis.__behavectlFs = fsSync.default ?? fsSync;

main().catch((error) => {
  console.error(
    renderCliError(error),
  );
  process.exitCode = 1;
});
