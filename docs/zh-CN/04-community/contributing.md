# 为 AgentScope 贡献

> Language: [English](../../../CONTRIBUTING.md) | zh-CN

感谢你对 AgentScope 感兴趣。项目仍处于早期阶段，因此清晰的 bug 报告、导入器样例、UI 反馈和聚焦的 Pull Request 都非常有价值。

## 贡献方式

- 报告 Codex、Claude Code 或其他 AI 工具的导入失败。
- 添加或改进 trace 导入器。
- 改进 trace viewer UI 和审查流程。
- 添加隐私和脱敏功能。
- 改进文档和示例。

## 本地设置

```bash
npm install
npm run dev
```

打开 Pull Request 前请运行生产构建：

```bash
npm run build
```

## Pull Request 指南

- 保持改动聚焦，便于审查。
- UI 变更请包含截图或简短录屏。
- 避免提交私有 trace 数据。
- 仅在样例 trace 是合成数据或已完全脱敏时提交。
- 行为变化时更新文档。

## Trace 样例

Trace 文件通常包含私有提示词、文件路径、命令输出和代码。在 issue 或 Pull Request 中分享 trace 前：

- 移除 secret 和 token。
- 移除客户或公司数据。
- 用占位符替换私有文件路径。
- 保留能复现问题的最小样例。

## Commit 风格

使用简短、描述性的提交信息。例如：

```text
fix: parse Codex JSONL after JSON fallback
feat: add Claude Code transcript importer
docs: document trace schema
```

## 行为准则

参与项目即表示你同意遵守 [行为准则](./code-of-conduct.md)。
