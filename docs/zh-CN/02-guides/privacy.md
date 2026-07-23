# 隐私指南

> Language: [English](../../PRIVACY.md) | zh-CN

AgentScope 是本地优先的，但 trace 数据仍可能非常敏感。

## Trace 可能包含什么

- 用户提示词和私有指令
- 源代码片段
- 文件路径和仓库名称
- Shell 命令和输出
- API key、token、cookie 和环境变量
- 客户或公司数据
- 内部模型或 Agent 响应

## 分享 trace 前

- 在对外分享前使用 **Sanitized JSON** 或 **HTML Report**。
- 在导出文件中搜索 `key`、`token`、`secret`、`password`、`Authorization`、`sk-` 和 `.env`。
- 确认私有文件路径已替换为占位符。
- 删除客户名称、内部 URL，以及自动规则无法识别的专有片段。
- 优先使用能复现问题的最小 trace 样例。
- 公开示例尽量使用合成 trace。

## 内置脱敏

AgentScope 在生成脱敏导出和静态 HTML 报告时，会对常见敏感值进行脱敏。

Secret-like values 包括：

- OpenAI 风格的 `sk-` API keys
- GitHub token 前缀，如 `ghp_`、`gho_`、`ghu_`、`ghs_` 和 `ghr_`
- AWS access key IDs
- JWT-like tokens
- `Authorization: Bearer ...` 和 `Authorization: Basic ...`
- 名称包含 `api_key`、`token`、`secret`、`password`、`passwd` 或 `pwd` 的赋值
- PEM private key blocks

Path-like values 包括：

- Windows drive paths，例如 `C:\Users\name\project\file.ts`
- Windows user paths，例如 `\Users\name\project\file.ts`
- POSIX user paths，例如 `/Users/name/project/file.ts` 和 `/home/name/project/file.ts`
- Tilde paths，例如 `~/project/file.ts`
- `file://` URLs

对于 `source.path`、`source.cwd` 和 changed file paths 等路径字段，AgentScope 会使用 `[REDACTED_PATH]` 替换目录信息，并在可能时保留最终文件名。Sanitized exports 中的 upstream `threadId` 和 `sessionId` 会被替换为 `[REDACTED]`。

## 分享选项

- **Export JSON** 下载当前加载的 trace，不做脱敏。仅用于可信本地审查。
- **Sanitized JSON** 下载脱敏后的 AgentScope trace，并包含记录 redaction counts 和 rule hits 的 `sharing` metadata block。
- **HTML Report** 下载单文件静态报告。它包含脱敏后的事件内容和内联样式，不依赖后端、账号、遥测或外部资源。

## 实时捕获隐私

`agentscope record` 和 `agentscope mcp-proxy` 默认将原始本地捕获写入 `.agentscope/traces/`。这些文件已被 Git 忽略，但仍可能包含私有提示词、命令输出、源码路径、环境派生值和 MCP payload。请在加载到 UI、脱敏并人工复核前将其视为敏感数据。

## 当前限制

自动脱敏是尽力而为的。它可能漏掉专有标识符、客户数据、内部 URL、不常见密钥格式或敏感相对路径。公开分享前必须人工检查脱敏导出。
