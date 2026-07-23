# 导入器 Fixtures

> Language: [English](../../../data/fixtures/README.md) | zh-CN

这些文件是用于导入器开发和手动 QA 的合成 fixtures。它们不能被替换为私有本地 trace。

- `agentscope-trace.json`：原生 AgentScope trace JSON。
- `codex-rollout.jsonl`：Codex rollout-style JSONL，包含 session metadata、response items、工具调用、patch 和 token usage。
- `claude-code.jsonl`：Claude Code transcript-style JSONL，包含 assistant tool use，并配对到后续 user tool result block。
- `generic-records.jsonl`：通用 role/type/content JSONL 记录。
