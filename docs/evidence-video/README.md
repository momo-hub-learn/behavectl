# Evidence replay video

A 30-second, 1920×1080 visualization of retained Codex evidence. This is **not a live screen recording**.

Source: verification `verify_mu47ggq14a94976b87` (2026-09-16). Three paired trials: two improved, one already passed; complete-task passes 1/3 → 3/3. This covers one challenge, not a general benchmark.

```sh
npm ci
npm run lint
npm run dev
npx remotion render EvidenceReplay out/behavectl-evidence-preview.mp4
```

The Evidence video workflow renders three review frames and a preview MP4 as downloadable Actions artifacts. It has read-only repository permissions and does not publish release assets. Review the frames before publishing the video or linking it from the homepage.
