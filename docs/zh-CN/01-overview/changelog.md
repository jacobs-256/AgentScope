# 变更记录

> Language: [English](../../../CHANGELOG.md) | zh-CN

AgentScope 的重要变更会记录在这里。

格式大致遵循 Keep a Changelog，项目在正式发布后会采用语义化版本。

## 0.1.0 - 未发布

### 新增

- 本地优先的 AI Agent trace viewer。
- 空默认工作区。
- 支持导入 AgentScope JSON、Codex JSONL、Claude Code JSONL 和通用 JSON/JSONL 记录。
- 支持本地 AI 工具记录的文件夹扫描导入。
- 按日期分组的纵向事件时间线。
- 针对 prompts、reasoning、tools、diffs 的事件筛选。
- 搜索、跳转、上一条、下一条、第一条和最后一条控制。
- 固定高度应用布局和局部滚动区域。
- Markdown 预览和源码视图。
- JSON 格式化和语法高亮。
- 代码语法高亮。
- 内容块复制操作。
- Codex rollout 导出辅助脚本。
- 当文件夹扫描检测到多个 trace 时显示导入选择器。
- 导入诊断面板，用于展示检测到的 trace、跳过的文件和 JSONL 解析警告。
- 原生 AgentScope、Codex、Claude Code 和通用 JSONL 的合成导入器 fixtures。
- 带密钥和文件路径脱敏的一键 Sanitized JSON 导出。
- 单文件静态 HTML 报告导出，用于可分享的脱敏审查。
- 本地 `agentscope` CLI，支持命令记录、MCP stdio proxy 捕获、耗时/状态跟踪和 `.agentscope/traces` 存储。
- 版本化 `traceVersion: "1.0"` trace schema。
- 导入器 fixture 测试套件和 CI 测试步骤。
- Trace 对比视图，可将当前加载的 trace 与第二个 trace 文件比较。

### 变更

- 将详细内容移动到中间主面板。
- 将事件列表移动到右侧。
- 压缩概览和指标区域，为事件和内容留出更多空间。
- 强化 Codex 导入：支持 session metadata、嵌套 `response_item` 和更广泛的 token usage 识别。
- 改进 Claude Code 导入：将 user message 中的 `tool_result` block 配对回 assistant 的 `tool_use` 调用。
- 文件夹扫描现在会检测 AgentScope 本地捕获 trace 路径。
- 导入器会将较旧的未版本化 trace 规范化为 schema version `1.0`。

### 安全

- 使用 DOMPurify 清理 Markdown 渲染。
- 在脱敏导出中加入常见 API key、token、Authorization header、private key 和本地文件路径的尽力脱敏。
- 忽略 `.agentscope/` 本地 trace 存储，避免提交原始实时捕获记录。
