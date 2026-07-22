# Changelog

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

### Changed

- Moved detailed content into the primary center panel.
- Moved event list to the right side.
- Compressed overview and metric areas to maximize event and content space.

### Security

- Sanitized Markdown rendering with DOMPurify.
