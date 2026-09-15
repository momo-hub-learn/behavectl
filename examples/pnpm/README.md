# pnpm correction example

Feed the fixture through the Claude hook adapter:

```bash
cat ../../test/fixtures/claude-user-prompt-correction.json \
  | node ../../src/cli/behavectl.mjs hook claude

node ../../src/cli/behavectl.mjs learn
node ../../src/cli/behavectl.mjs patches
```

Expected candidate behavior:

> Don't use npm in this repo. We always use pnpm.
