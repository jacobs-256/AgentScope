# AgentScope

> Language: [English](../../../README.md) | zh-CN

AgentScope 是面向 AI Agent 的开源 DevTools。

AgentScope 会把 AI Agent 的运行过程转换成可阅读的时间线：提示词、推理、工具调用、MCP 活动、文件变更、失败信息、Token、成本和原始输出都可以在一个本地优先的工作区中查看。

## 为什么需要 AgentScope

AI 编码 Agent 正在进入日常开发流程，但大多数运行记录事后仍然很难审查。当运行失败时，团队通常需要知道：

- 这次运行由什么提示词或指令触发？
- Agent 说了什么、推理了什么、跳过了什么？
- 它调用了哪些工具、命令、MCP Server，触碰了哪些文件？
- 失败发生在哪里？
- 运行记录能否在不发送到托管服务的情况下被分享、审查或归档？

AgentScope 是一个轻量级本地 trace viewer，用于回答这些问题。

## 功能亮点

- **本地优先 trace viewer**：不需要账号、后端或遥测。
- **文件夹扫描导入**：选择 Codex 或 Claude Code 记录目录，查看检测到的 trace 并选择需要加载的记录。
- **Codex 支持**：导入 Codex rollout JSONL 记录。
- **Claude Code 支持**：导入 transcript-style JSONL 记录。
- **时间线审查模式**：支持筛选、搜索、跳转，以及在事件间快速移动。
- **Markdown / JSON / 代码查看器**：预览 Markdown、格式化 JSON、高亮代码并复制内容。
- **按日期分组的事件列表**：事件按天聚合成纵向时间线。
- **Trace 导出**：将当前加载的 trace 导出为 JSON。
- **导入诊断**：查看被跳过的文件、JSONL 解析警告和检测到的 trace 候选项。
- **隐私导出**：生成脱敏 JSON 或单文件静态 HTML 报告，便于审查和分享。
- **实时捕获 CLI**：把命令运行和 MCP stdio 会话记录成本地 trace 文件。
- **稳定 trace schema**：新 trace 包含 `traceVersion: "1.0"`，导入器 fixtures 会在 CI 中测试。
- **Trace 对比**：加载第二个 trace，对比事件数量、失败数、工具调用、diff、耗时、Token 和 risk。

## 当前状态

AgentScope 仍处于早期 MVP 阶段。目前已经可用于查看导入的 trace，但 trace schema 和导入器在 `1.0` 前仍可能调整。

## 演示数据

仓库包含样例 trace：

```text
data/sample-trace.json
data/fixtures/
```

应用默认不会自动加载样例数据。启动应用后，请通过 **Load Trace** 或 **Scan Folder** 手动加载。

## 快速开始

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址，通常是：

```text
http://127.0.0.1:5173
```

生产构建：

```bash
npm run build
```

预览生产构建：

```bash
npm run preview
```

## 实时捕获

将命令运行记录成本地 AgentScope trace：

```bash
npm run agentscope -- record -- npm run build
```

代理 MCP stdio server，并捕获 JSON-RPC 请求的耗时和状态：

```bash
npm run agentscope -- mcp-proxy -- node ./mcp-server.js
```

捕获的 trace 会写入：

```text
.agentscope/traces/
```

列出本地捕获记录：

```bash
npm run agentscope -- list
```

`.agentscope/` 已被 Git 忽略，因为实时捕获可能包含私有 trace 数据。详见 [实时捕获](../02-guides/live-capture.md)。

## 导入 Trace

### 加载单个文件

使用 **Load Trace** 导入：

- AgentScope trace JSON
- Codex rollout JSONL
- Claude Code transcript-style JSONL
- 包含 role/type/content 字段的通用 AI 工具 JSON/JSONL

### 扫描文件夹

使用 **Scan Folder** 选择本地文件夹。AgentScope 会扫描候选文件、检测支持的记录，并在发现多个 trace 时打开选择器。导入诊断面板会列出检测到的 trace、被跳过的文件，以及单行 JSONL 解析警告。

推荐目录：

```text
~/.codex/sessions
~/.claude/projects
```

在 Windows 上，Codex 记录通常位于：

```text
C:\Users\<you>\.codex\sessions
```

浏览器安全限制要求用户手动选择文件夹。AgentScope 不能静默读取隐藏目录。

## 使用 Python 导出本地 Codex 记录

AgentScope 还包含一个用于导出本地 Codex 记录的辅助脚本：

```bash
python scripts/codex-rollout-to-trace.py --list
python scripts/codex-rollout-to-trace.py --latest --out data/codex-latest-trace.json
python scripts/codex-rollout-to-trace.py --thread 019f8551 --out data/my-run.trace.json
```

Codex rollout 文件通常位于：

```text
~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
```

该脚本还会读取本地 Codex thread index：

```text
~/.codex/state_5.sqlite
```

## Trace 格式

AgentScope 使用简单的 JSON 结构。支持的 step 类型包括：

- `prompt`
- `reasoning`
- `tool`
- `diff`

详见 [Trace 格式](../03-reference/trace-format.md)。
兼容性规则见 [Schema 版本管理](../03-reference/schema-versioning.md)。

## 隐私

Agent trace 可能包含敏感信息：提示词、源代码路径、代码片段、命令输出、密钥、客户数据或内部推理。公开分享前请务必审查。

使用 **Sanitized JSON** 可以导出脱敏 trace。使用 **HTML Report** 可以导出自包含的静态报告。自动脱敏覆盖常见密钥格式和本地文件路径，但公开分享前仍需人工复核。

详见 [隐私指南](../02-guides/privacy.md) 和 [安全政策](../04-community/security.md)。

## 开发

```bash
npm install
npm run dev
npm run build
npm test
```

项目结构：

```text
src/                         应用源码
data/                        样例和生成的 trace
docs/                        项目文档
scripts/                     本地导入/导出辅助脚本
.github/                     GitHub issue 和 PR 模板
```

详见 [开发指南](../02-guides/development.md)。

## 路线图

- MCP proxy mode，用于实时捕获工具调用。
- 支持更多 AI 工具和 IDE 扩展导入器。
- 单文件 HTML trace 报告。
- 密钥和私有路径脱敏规则。
- GitHub Action 集成 CI trace。
- Trace 对比视图。

详见 [路线图](./roadmap.md)。

## 贡献

欢迎贡献。提交 Pull Request 前请阅读 [贡献指南](../04-community/contributing.md)。

## 许可证

MIT。详见 `LICENSE`。
