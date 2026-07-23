# 安全政策

> Language: [English](../../../SECURITY.md) | zh-CN

## 支持版本

AgentScope 当前尚未达到 1.0。安全修复会面向默认分支上的最新版本。

## 报告漏洞

如果漏洞涉及 secret 暴露、不安全 trace 渲染、本地文件访问或导入器行为，请不要打开公开 issue。

请私下报告给仓库维护者。如果还没有配置私密渠道，请打开一个最小公开 issue，询问私密联系方式，不要包含敏感细节。

## 敏感 Trace 数据

Agent trace 可能包含：

- API key、access token 和环境变量
- 私有提示词和指令
- 源代码和文件路径
- 命令输出和 stack trace
- 客户或公司数据

分享 trace 前请审查并脱敏。

## 本地优先设计

AgentScope 设计为在浏览器中本地运行。当前 MVP 不需要托管后端。浏览器文件夹扫描仍需要用户明确选择，因为 Web 应用不能静默读取本地文件夹。

## 已知安全注意事项

- Markdown 在预览渲染前会被清理。
- JSON 和代码会以文本或清理后的高亮 HTML 渲染。
- 导入器应将所有 trace 内容视为不可信输入。
- 脱敏并不完整；不要依赖 AgentScope 自动移除所有 secret。
