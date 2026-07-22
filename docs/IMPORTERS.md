# Importers

AgentScope imports AI agent records and converts them into the AgentScope trace format.

## Supported formats

| Source | Status | Notes |
|---|---|---|
| AgentScope trace JSON | Supported | Native format with a `steps` array. |
| Codex rollout JSONL | Supported | Detects `payload.type` records. |
| Claude Code transcript JSONL | Experimental | Detects message role and tool-use blocks. |
| Generic JSON/JSONL | Experimental | Uses `role`, `type`, `content`, `message`, and `text` fields. |

## Folder scan

The browser import uses a manual folder picker. Candidate files are selected by extension and path hints:

- `.json`
- `.jsonl`
- `.log`
- paths containing `rollout`, `session`, `transcript`, `claude`, `codex`, or `conversation`

If multiple traces are detected, the current MVP loads the most recently modified trace. A future version will add a trace picker.

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

## Claude Code

Recommended folder:

```text
~/.claude/projects
```

The importer looks for user and assistant messages, tool-use blocks, and tool-result blocks.

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
