# 实时捕获

> Language: [English](../../LIVE_CAPTURE.md) | zh-CN

AgentScope 包含一个本地 CLI，用于将命令运行和 MCP stdio 会话记录为 AgentScope trace JSON。

所有捕获输出默认都保存在本地。CLI 会将 trace 写入：

```text
.agentscope/traces/
```

该目录已被 Git 忽略，因为捕获记录可能包含提示词、命令输出、文件路径、环境值和密钥。

## 命令记录

使用 `agentscope record -- <command>` 运行命令，并将 stdout、stderr、退出状态、耗时和工作目录 metadata 保存为 trace。

```bash
npm run agentscope -- record -- npm test
npx agentscope record -- npm test
```

选项：

```text
--out <path>      将 trace 写入指定路径。
--title <title>   覆盖显示的命令标题。
```

示例：

```bash
npm run agentscope -- record --out .agentscope/traces/build.trace.json -- npm run build
```

该命令会使用被包装命令的退出码退出，因此可用于脚本和 CI 实验。

## MCP Proxy Mode

使用 `agentscope mcp-proxy -- <server-command>` 在透明代理后启动 MCP stdio server。

```bash
npm run agentscope -- mcp-proxy -- node ./mcp-server.js
```

Proxy 会将 stdin 转发给 server，并将 stdout 转回 client。它会观察 line-delimited JSON-RPC 消息并记录：

- client requests，作为 `tool` steps
- 按 JSON-RPC `id` 配对的 server responses
- 请求耗时
- response 包含 `error` 时标记 failed
- server stderr，作为 warning 或 failed tool step

选项：

```text
--out <path>      将 trace 写入指定路径。
--name <name>     覆盖显示的 MCP server 名称。
```

## 本地 Trace 存储

列出最近的本地 trace：

```bash
npm run agentscope -- list
```

可在 UI 中通过 **Load Trace** 加载记录的 trace，或对 `.agentscope/traces` 使用 **Scan Folder**。

## 隐私说明

实时捕获是原始本地记录。它可能包含私有源码路径、源代码、token、命令输出和客户数据。

分享捕获记录前：

- 将其加载到 AgentScope UI。
- 使用 **Sanitized JSON** 或 **HTML Report**。
- 人工复核导出文件。
