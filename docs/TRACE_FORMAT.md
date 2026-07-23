# Trace Format

AgentScope traces are JSON documents that describe one AI agent run.

## Top-level fields

| Field | Type | Required | Description |
|---|---:|---:|---|
| `runId` | string | yes | Unique run identifier. |
| `agent` | string | yes | Agent or tool name. |
| `model` | string | no | Model name if known. |
| `status` | string | no | Run status, such as `ok` or `failed`. |
| `startedAt` | string | no | ISO timestamp. |
| `durationMs` | number | no | Run duration in milliseconds. |
| `tokens` | object | no | Token totals. |
| `costUsd` | number | no | Estimated cost in USD. |
| `riskScore` | number | no | UI risk score from 0 to 100. |
| `summary` | string | no | Human-readable run summary. |
| `source` | object | no | Import source metadata. |
| `sharing` | object | no | Sanitized export metadata. |
| `steps` | array | yes | Ordered event list. |

## Source fields

`source` is optional, but importers should include it when a trace is converted from another tool.

| Field | Type | Required | Description |
|---|---:|---:|---|
| `kind` | string | no | Importer identifier, such as `codex_rollout`, `claude_code_jsonl`, or `generic_jsonl`. |
| `path` | string | no | Browser-provided file or relative folder path. Treat as sensitive. |
| `recordCount` | number | no | Number of source records used by the importer. |
| `threadId` | string | no | Upstream thread/conversation id when available. |
| `sessionId` | string | no | Upstream session id when available. |
| `cwd` | string | no | Upstream working directory when available. Treat as sensitive. |
| `cliVersion` | string | no | Upstream CLI version when available. |

## Sharing fields

Sanitized JSON exports include a `sharing` block.

| Field | Type | Required | Description |
|---|---:|---:|---|
| `sanitizedAt` | string | no | ISO timestamp when the sanitized export was generated. |
| `mode` | string | no | Export mode, currently `sanitized`. |
| `redactions` | object | no | Redaction counters for sharing review. |

`sharing.redactions` includes:

| Field | Type | Required | Description |
|---|---:|---:|---|
| `secrets` | number | no | Count of secret-like matches replaced with `[REDACTED]`. |
| `paths` | number | no | Count of path-like matches replaced with `[REDACTED_PATH]`. |
| `rules` | object | no | Per-rule match counts. |

## Step fields

| Field | Type | Required | Description |
|---|---:|---:|---|
| `id` | string | yes | Unique step id inside the trace. |
| `type` | string | yes | One of `prompt`, `reasoning`, `tool`, `diff`. |
| `title` | string | yes | Short event title. |
| `timestamp` | string | no | ISO timestamp used for date grouping. |
| `time` | string | no | Display time, such as `14:12:02`. |
| `durationMs` | number | no | Event duration. |
| `status` | string | no | One of `ok`, `warning`, `failed`. |
| `content` | string | no | Main event content. |
| `tool` | string | no | Tool name for `tool` events. |
| `input` | string | no | Tool input. |
| `output` | string | no | Tool output. |
| `files` | array | no | Changed files for `diff` events. |

## Example

```json
{
  "runId": "run_demo_001",
  "agent": "Codex",
  "model": "gpt-5-codex",
  "status": "ok",
  "startedAt": "2026-07-21T14:08:12Z",
  "tokens": {
    "input": 12000,
    "output": 3200,
    "total": 15200
  },
  "costUsd": 0,
  "riskScore": 24,
  "summary": "Demo agent run.",
  "steps": [
    {
      "id": "s1",
      "type": "prompt",
      "title": "User Request",
      "timestamp": "2026-07-21T14:08:12Z",
      "time": "14:08:12",
      "status": "ok",
      "content": "Refactor the billing retry flow."
    }
  ]
}
```

## Notes

- `timestamp` is preferred for date grouping.
- `time` is only a display convenience.
- Unknown token and cost values should be `0`.
- Trace content is treated as untrusted user content.
