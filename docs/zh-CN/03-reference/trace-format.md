# Trace 格式

> Language: [English](../../TRACE_FORMAT.md) | zh-CN

AgentScope trace 是描述一次 AI Agent 运行的 JSON 文档。

## 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `traceVersion` | string | 是 | 版本化 AgentScope trace schema。当前稳定值是 `1.0`。 |
| `runId` | string | 是 | Trace 的唯一运行标识。 |
| `agent` | string | 是 | Agent 或工具名称。 |
| `model` | string | 否 | 可用时记录模型名称。 |
| `status` | string | 否 | 运行状态，例如 `ok` 或 `failed`。 |
| `startedAt` | string | 否 | ISO timestamp。 |
| `durationMs` | number | 否 | 运行耗时，单位毫秒。 |
| `tokens` | object | 否 | Token totals。 |
| `costUsd` | number | 否 | 估算美元成本。 |
| `riskScore` | number | 否 | UI risk score，范围 0 到 100。 |
| `summary` | string | 否 | 人类可读的运行摘要。 |
| `source` | object | 否 | 导入源 metadata。 |
| `sharing` | object | 否 | 脱敏导出 metadata。 |
| `steps` | array | 是 | 有序事件列表。 |

## Source 字段

`source` 是可选字段，但从其他工具转换 trace 时，导入器应尽量包含它。

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `kind` | string | 否 | 导入器或捕获标识，例如 `codex_rollout`、`claude_code_jsonl`、`generic_jsonl`、`agentscope_record` 或 `agentscope_mcp_proxy`。 |
| `path` | string | 否 | 浏览器提供的文件路径或相对文件夹路径。应视为敏感信息。 |
| `recordCount` | number | 否 | 导入器使用的源记录数量。 |
| `threadId` | string | 否 | 可用时记录上游 thread/conversation id。 |
| `sessionId` | string | 否 | 可用时记录上游 session id。 |
| `cwd` | string | 否 | 可用时记录上游工作目录。应视为敏感信息。 |
| `cliVersion` | string | 否 | 可用时记录上游 CLI 版本。 |
| `command` | string | 否 | 本地实时捕获 trace 中记录的命令。应视为敏感信息。 |

## Sharing 字段

Sanitized JSON exports 会包含 `sharing` block。

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `sanitizedAt` | string | 否 | 生成脱敏导出的 ISO timestamp。 |
| `mode` | string | 否 | 导出模式，当前为 `sanitized`。 |
| `redactions` | object | 否 | 用于分享审查的 redaction counters。 |

`sharing.redactions` 包含：

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `secrets` | number | 否 | 被替换为 `[REDACTED]` 的 secret-like matches 数量。 |
| `paths` | number | 否 | 被替换为 `[REDACTED_PATH]` 的 path-like matches 数量。 |
| `rules` | object | 否 | 每条规则的命中次数。 |

## Step 字段

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `id` | string | 是 | Trace 内唯一 step id。 |
| `type` | string | 是 | `prompt`、`reasoning`、`tool`、`diff` 之一。 |
| `title` | string | 是 | 简短事件标题。 |
| `timestamp` | string | 否 | 用于日期分组的 ISO timestamp。 |
| `time` | string | 否 | 显示时间，例如 `14:12:02`。 |
| `durationMs` | number | 否 | 事件耗时。 |
| `status` | string | 否 | `ok`、`warning`、`failed` 之一。 |
| `content` | string | 否 | 主要事件内容。 |
| `tool` | string | 否 | `tool` 事件的工具名称。 |
| `input` | string | 否 | 工具输入。 |
| `output` | string | 否 | 工具输出。 |
| `files` | array | 否 | `diff` 事件的变更文件。 |

## 示例

```json
{
  "traceVersion": "1.0",
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

## 说明

- 新 trace 必须包含 `traceVersion`。导入器会将较旧的未版本化 trace 规范化为 `1.0`。
- `timestamp` 优先用于日期分组。
- `time` 只是显示便利字段。
- 未知 token 和 cost 值应为 `0`。
- Trace content 应视为不可信用户内容。
