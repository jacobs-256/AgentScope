# Importer Fixtures

These files are synthetic fixtures for importer development and manual QA. They must not be replaced with private local traces.

- `agentscope-trace.json`: native AgentScope trace JSON.
- `codex-rollout.jsonl`: Codex rollout-style JSONL with session metadata, response items, a tool call, a patch, and token usage.
- `claude-code.jsonl`: Claude Code transcript-style JSONL with an assistant tool use paired to a later user tool result block.
- `generic-records.jsonl`: generic role/type/content JSONL records.
