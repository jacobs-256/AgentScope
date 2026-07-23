# 路线图

> Language: [English](../../../ROADMAP.md) | zh-CN

AgentScope 仍处于早期 MVP。路线图保持务实，目标是让工具真正适用于 AI Agent 调试。

## 0.1 - Trace Viewer MVP

- [x] 本地 Vite 应用
- [x] 空默认状态
- [x] 加载 trace JSON
- [x] 扫描本地文件夹
- [x] 导入 Codex rollout JSONL
- [x] 导入 Claude Code transcript-style JSONL
- [x] 按日期分组的事件时间线
- [x] Markdown、JSON 和代码内容查看器
- [x] 导出 trace JSON

## 0.2 - 导入器强化

- [x] 更好的 Codex 元数据提取
- [x] 更好的 Claude Code tool result 配对
- [x] Cursor 和 Cline 导入器调研
- [x] 发现多个 trace 时显示导入结果选择器
- [x] 导入错误诊断面板
- [x] 每个导入器的样例 trace fixtures

## 0.3 - 隐私与分享

- [x] 密钥脱敏规则
- [x] 文件路径脱敏规则
- [x] 一键脱敏导出
- [x] 单文件 HTML trace 报告
- [x] 可分享的静态报告模式

## 0.4 - 实时捕获

- [x] `agentscope record -- <command>`
- [x] MCP proxy mode
- [x] 工具调用耗时和状态跟踪
- [x] 本地 trace 存储

## 1.0 - 稳定 Trace Schema

- [x] 版本化 trace schema
- [x] 导入器测试套件
- [x] 稳定文档
- [x] GitHub Action 集成
- [x] Trace 对比视图
