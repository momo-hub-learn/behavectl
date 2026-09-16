# Hero Demo — Recording Script

Target length: **25–35 seconds**. Use the retained native Codex certification
from September 16, 2026. Label edited playback **Recorded real run**; do not
present cuts or replays as a new live execution.

## Scene 1 — the bug that comes back (0–6s)

Show the task: change `displayName` from `Alpha` to `Beta`.
Show trial 1 baseline: only `dist/app-config.json` changed. The generated file
looks correct, but the independent verification reports `generated config is stale`.
The canonical source still says `Alpha`.

## Scene 2 — one correction (6–11s)

Show the rule: edit the canonical source, then regenerate the output.
Use the retained patch text when recording; this sentence is a summary.

## Scene 3 — the actual behavior changes (11–22s)

Show trial 1 candidate file changes side by side:

- `config/app-config.source.json`: `Alpha` → `Beta`
- `dist/app-config.json`: `Alpha` → `Beta`

Show the retained command: `node scripts/generate-config.mjs`.
All four checks pass: source updated, generated file updated, generator run,
and source/output consistency.

## Scene 4 — repeated evidence (22–29s)

Show the complete three-pair result, not just the successful first pair:

```text
Codex               WITHOUT RULE     WITH RULE
Complete task pass       1/3             3/3

2 pairs improved · 1 pair already passed
6 real tasks · 13/13 release checks · RC GO
```

## Scene 5 — inspect before promotion (29–35s)

Show the retained proof and the exact package fingerprint. End card:

> Behavectl — Test the rule before your agent keeps it.

Do not show a promotion as completed unless it was actually executed and
recorded. Certification is evidence of eligibility, not evidence of promotion.

## Source and recording rules

- Certification: `live_mu47ciwe498dc7c515`.
- Verification: `verify_mu47ggq14a94976b87`.
- Use `proof/evaluations/codex-trial-01.json` for the selected file/command scene.
- Use all three retained evaluations for aggregate scores.
- Keep the original proof bundle unchanged; edit only the presentation.
- Crop private local paths and account details out of the public recording.
- No simulated commands, invented outcomes, or untested agent claims.
- Keep the result limitation visible: one challenge, Codex, three paired trials.
- `assets/codex-proof.svg` is a static evidence summary, not a recording or UI screenshot.

The recording itself remains a launch-checklist item until a video is produced
and visually checked.
