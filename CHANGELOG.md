# Changelog

> Language: English | [中文简体](./docs/zh-CN/01-overview/changelog.md)

All notable changes to AgentScope will be documented here.

The format loosely follows Keep a Changelog, and this project uses semantic versioning once releases begin.

## 0.1.0 - Unreleased

### Added

- Local-first AI agent trace viewer.
- Empty default workspace.
- File import for AgentScope JSON, Codex JSONL, Claude Code JSONL, and generic JSON/JSONL records.
- Folder scan import for local AI tool records.
- Date-grouped vertical event timeline.
- Event filters for prompts, reasoning, tools, and diffs.
- Search, jump, previous, next, first, and last controls.
- Fixed-height application layout with local scrolling areas.
- Markdown preview and source view.
- JSON formatting and syntax highlighting.
- Code syntax highlighting.
- Copy actions for content blocks.
- Codex rollout export helper script.
- Import picker for folder scans that detect multiple traces.
- Import diagnostics panel for detected traces, skipped files, and JSONL parse warnings.
- Synthetic importer fixtures for native AgentScope, Codex, Claude Code, and generic JSONL records.
- One-click sanitized JSON export with secret and file-path redaction.
- Single-file static HTML report export for shareable sanitized reviews.
- Local `agentscope` CLI with command recording, MCP stdio proxy capture, timing/status tracking, and `.agentscope/traces` storage.
- Versioned `traceVersion: "1.0"` trace schema.
- Importer fixture test suite and CI test step.
- Trace comparison view for comparing a loaded trace against a second trace file.

### Changed

- Moved detailed content into the primary center panel.
- Moved event list to the right side.
- Compressed overview and metric areas to maximize event and content space.
- Hardened Codex imports with session metadata extraction, nested `response_item` handling, and broader token usage detection.
- Improved Claude Code imports by pairing user-message `tool_result` blocks back to assistant `tool_use` calls.
- Folder scans now detect AgentScope local capture trace paths.
- Importers normalize older unversioned traces to schema version `1.0`.

### Security

- Sanitized Markdown rendering with DOMPurify.
- Added best-effort redaction for common API keys, tokens, authorization headers, private keys, and local file paths in sanitized exports.
- Ignored `.agentscope/` local trace storage to avoid committing raw live captures.
