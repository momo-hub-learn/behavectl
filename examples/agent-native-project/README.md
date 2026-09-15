# Agent-native Behavectl example

This directory illustrates the project shape created by:

```bash
behavectl init --all --mcp
```

Expected integration surfaces:

```text
.claude/skills/behavectl/SKILL.md
.agents/skills/behavectl/SKILL.md
.agents/skills/behavectl/agents/openai.yaml
.mcp.json
.behavectl/
```

The Skill teaches Claude Code / Codex when and how to use Behavectl. The MCP
server gives Claude structured read-only access to behavior state.

Mutation remains explicit through the Behavectl CLI.

Try this in a real repository rather than copying these files by hand:

```bash
npx behavectl init --all --mcp
```
