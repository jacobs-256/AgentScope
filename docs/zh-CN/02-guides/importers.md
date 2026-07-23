# 导入器

> Language: [English](../../IMPORTERS.md) | zh-CN

AgentScope 会导入 AI Agent 记录，并将其转换为 AgentScope trace 格式。

## 支持的格式

| 来源 | 状态 | 说明 |
|---|---|---|
| AgentScope trace JSON | 支持 | 原生格式，包含 `steps` 数组。 |
| Codex rollout JSONL | 支持 | 检测 `payload.type` 记录、`response_item` 记录、session metadata、工具调用、patch 和 token usage。 |
| Claude Code transcript JSONL | 实验性 | 检测 message role、assistant tool-use block，以及后续 user tool-result block。 |
| 通用 JSON/JSONL | 实验性 | 使用 `role`、`type`、`content`、`message` 和 `text` 字段。 |

## 文件夹扫描

浏览器导入使用手动文件夹选择器。候选文件通过扩展名和路径提示筛选：

- `.json`
- `.jsonl`
- `.log`
- 路径包含 `rollout`、`session`、`transcript`、`claude`、`codex`、`conversation`、`cursor`、`cline`、`agentscope` 或 `trace`

如果检测到多个 trace，AgentScope 会显示导入选择器。最佳匹配会先按文件修改时间排序，再按事件数量排序，但最终由用户选择加载哪个 trace。

导入诊断面板会记录检测到的 trace、跳过的文件、被截断的文件夹扫描，以及单行 JSONL 解析警告。诊断只包含文件路径和解析器消息，不会回显无效行内容。

## Codex

推荐目录：

```text
~/.codex/sessions
```

Rollout 文件通常类似：

```text
rollout-YYYY-MM-DDTHH-MM-SS-<thread-id>.jsonl
```

AgentScope 会读取以下事件：

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

导入器还会在可用时读取 Codex session metadata：

- 使用 `thread_id`、`conversation_id` 或 `session_id` 作为 `runId`
- `model` 或 `model_slug`
- `originator`、`cwd`、`cli_version` 和 title/name 字段
- 来自 `usage`、`token_usage` 或 `info.total_token_usage` 的 token totals

Codex `response_item` 记录会在转换前展开，因此嵌套的 `message`、`reasoning`、`function_call` 和 `function_call_output` 会像顶层 payload 记录一样处理。

## Claude Code

推荐目录：

```text
~/.claude/projects
```

导入器会查找 user/assistant message、tool-use block 和 tool-result block。Claude Code 通常会把工具结果保存为后续 user message 内的 `tool_result` block；AgentScope 会将这些 block 配对回 assistant 的 `tool_use.id`，保留原始结果文本，并将错误结果标记为 failed。

## Cursor 和 Cline 调研

本版本中 Cursor 和 Cline 支持仍处于调研阶段。文件夹扫描已加入 `cursor` 和 `cline` 路径提示，方便测试脱敏捕获，但在获得稳定的合成样例前不会提交自动转换器。

调研说明：

- Cursor agent history 可能因产品渠道和工作区存储位置而异，因此导入器工作应从用户提供的脱敏 JSON/JSONL 导出开始。
- Cline task 记录预计包含 assistant/user messages 和 tool-use metadata，但启用自动检测前应先用合成 fixtures 确认具体本地格式。
- 两类导入器都应保留 command/tool 输入输出，避免因缺失可选字段而 fatal error，并从 fixtures 中脱敏或排除私有工作区数据。

## 合成 Fixtures

导入器 fixtures 位于：

```text
data/fixtures/
```

当前 fixtures 覆盖原生 AgentScope trace JSON、Codex rollout JSONL、Claude Code transcript JSONL 和通用 JSONL 记录。它们是合成数据，适合提交到仓库。

运行导入器 fixture 测试：

```bash
npm test
```

## 添加导入器

导入器应满足：

- 接受不可信 JSON/JSONL 记录。
- 不因无关文件抛错。
- 在可用时保留原始时间戳。
- 生成稳定的 `prompt`、`reasoning`、`tool` 或 `diff` steps。
- 避免意外泄露或转换密钥。

导入器逻辑当前位于：

```text
src/main.jsx
```
