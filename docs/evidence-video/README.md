# Evidence replay video

A 30-second, 1920×1080 visualization of retained Codex evidence. This is **not a live screen recording**.

Source: verification `verify_mu47ggq14a94976b87` (2026-09-16). Three paired trials: two improved, one already passed; complete-task passes 1/3 → 3/3. This covers one challenge, not a general benchmark.

```sh
npm ci
npm run lint
npm run dev
npx remotion render EvidenceReplay out/behavectl-evidence-preview.mp4
```

On main-branch changes to this directory or its workflow, the Evidence video workflow renders three review frames and a preview MP4. It also supports manual runs on main. Successful runs upload these four named media files to the existing `v0.1.0-alpha.1` GitHub release, replacing same-name assets. Runs are serialized to avoid concurrent uploads. The certified installation package is not an upload target. Actions artifacts remain available for 14 days, including diagnostics on failure. Review the frames before linking the preview from the homepage.
