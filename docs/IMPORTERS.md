# Importers

> Language: English | [中文简体](./zh-CN/02-guides/importers.md)

AgentScope imports AI agent records and converts them into the AgentScope trace format.

## Supported formats

| Source | Status | Notes |
|---|---|---|
| AgentScope trace JSON | Supported | Native format with a `steps` array. |
| Codex rollout JSONL | Supported | Detects `payload.type` records, `response_item` records, session metadata, tool calls, patches, and token usage. |
| Claude Code transcript JSONL | Experimental | Detects message role, assistant tool-use blocks, and later user tool-result blocks. |
| Generic JSON/JSONL | Experimental | Uses `role`, `type`, `content`, `message`, and `text` fields. |

## Folder scan

The browser import uses a manual folder picker. Candidate files are selected by extension and path hints:

- `.json`
- `.jsonl`
- `.log`
- paths containing `rollout`, `session`, `transcript`, `claude`, `codex`, `conversation`, `cursor`, `cline`, `agentscope`, or `trace`

If multiple traces are detected, AgentScope shows an import picker. The best match is sorted first by file modification time, then by event count, but users choose which trace to load.

The import diagnostics panel records detected traces, skipped files, truncated folder scans, and isolated JSONL parse warnings. Diagnostics include file paths and parser messages only; invalid line content is not echoed.

## Codex

Recommended folder:

```text
~/.codex/sessions
```

Rollout files usually look like:

```text
rollout-YYYY-MM-DDTHH-MM-SS-<thread-id>.jsonl
```

AgentScope reads events such as:

- `user_message`
- `agent_message`
- `agent_reasoning`
- `reasoning`
- `function_call`
- `function_call_output`
- `custom_tool_call`
- `custom_tool_call_output`
- `patch_apply_end`
- `token_count`

The importer also reads Codex session metadata when available:

- `thread_id`, `conversation_id`, or `session_id` for `runId`
- `model` or `model_slug`
- `originator`, `cwd`, `cli_version`, and title/name fields
- token totals from `usage`, `token_usage`, or `info.total_token_usage`

Codex `response_item` records are unwrapped before conversion, so nested `message`, `reasoning`, `function_call`, and `function_call_output` items are handled like top-level payload records.

## Claude Code

Recommended folder:

```text
~/.claude/projects
```

The importer looks for user and assistant messages, tool-use blocks, and tool-result blocks. Claude Code often stores tool results as `tool_result` blocks inside later user messages; AgentScope pairs those blocks back to the assistant `tool_use.id`, preserves the raw result text, and marks errored results as failed.

## Cursor and Cline Research

Cursor and Cline support remains research-only in this release. Folder scanning now includes `cursor` and `cline` path hints so sanitized captures can be tested manually, but there is no committed converter until stable synthetic examples are available.

Research notes:

- Cursor agent history appears to vary by product channel and workspace storage location, so importer work should start from sanitized user-provided JSON/JSONL exports.
- Cline task records are expected to contain assistant/user messages plus tool-use metadata, but exact local formats should be confirmed with synthetic fixtures before automatic detection is enabled.
- Both importers should preserve command/tool inputs and outputs, avoid fatal errors for missing optional fields, and redact or exclude private workspace data from fixtures.

## Synthetic Fixtures

Importer fixtures live in:

```text
data/fixtures/
```

Current fixtures cover native AgentScope trace JSON, Codex rollout JSONL, Claude Code transcript JSONL, and generic JSONL records. They are synthetic and safe for repository use.

Run importer fixture tests with:

```bash
npm test
```

## Adding an importer

An importer should:

- Accept untrusted JSON/JSONL records.
- Avoid throwing on unrelated files.
- Preserve original timestamps when available.
- Produce stable `prompt`, `reasoning`, `tool`, or `diff` steps.
- Avoid leaking or transforming secrets unexpectedly.

Importer logic currently lives in:

```text
src/main.jsx
```
