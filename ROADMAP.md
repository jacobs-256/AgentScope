# Roadmap

AgentScope is an early MVP. This roadmap is intentionally practical and focused on making the tool useful for real AI agent debugging.

## 0.1 - Trace Viewer MVP

- [x] Local Vite app
- [x] Empty default state
- [x] Load trace JSON
- [x] Scan local folders
- [x] Import Codex rollout JSONL
- [x] Import Claude Code transcript-style JSONL
- [x] Date-grouped event timeline
- [x] Markdown, JSON, and code content viewer
- [x] Export trace JSON

## 0.2 - Importer Hardening

- [ ] Better Codex metadata extraction
- [ ] Better Claude Code tool result pairing
- [ ] Cursor and Cline importer research
- [ ] Import result picker when multiple traces are found
- [ ] Import error diagnostics panel
- [ ] Sample trace fixtures for each importer

## 0.3 - Privacy and Sharing

- [ ] Secret redaction rules
- [ ] File path redaction rules
- [ ] One-click sanitized export
- [ ] Single-file HTML trace report
- [ ] Shareable static report mode

## 0.4 - Live Capture

- [ ] `agentscope record -- <command>`
- [ ] MCP proxy mode
- [ ] Tool call timing and status tracking
- [ ] Local trace storage

## 1.0 - Stable Trace Schema

- [ ] Versioned trace schema
- [ ] Importer test suite
- [ ] Stable documentation
- [ ] GitHub Action integration
- [ ] Trace comparison view
