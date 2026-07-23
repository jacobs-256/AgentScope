# Live Capture

> Language: English | [中文简体](./zh-CN/02-guides/live-capture.md)

AgentScope includes a local CLI for recording command runs and MCP stdio sessions into AgentScope trace JSON.

All capture output is local by default. The CLI writes traces under:

```text
.agentscope/traces/
```

This directory is ignored by Git because captured traces can contain prompts, command output, file paths, environment values, and secrets.

## Command Recording

Use `agentscope record -- <command>` to run a command and save stdout, stderr, exit status, timing, and working-directory metadata as a trace.

```bash
npm run agentscope -- record -- npm test
npx agentscope record -- npm test
```

Options:

```text
--out <path>      Write the trace to a specific path.
--title <title>   Override the displayed command title.
```

Example:

```bash
npm run agentscope -- record --out .agentscope/traces/build.trace.json -- npm run build
```

The command exits with the wrapped command's exit code, so it can be used in scripts and CI experiments.

## MCP Proxy Mode

Use `agentscope mcp-proxy -- <server-command>` to start an MCP stdio server behind a transparent proxy.

```bash
npm run agentscope -- mcp-proxy -- node ./mcp-server.js
```

The proxy forwards stdin to the server and stdout back to the client. It observes line-delimited JSON-RPC messages and records:

- client requests as `tool` steps
- server responses paired by JSON-RPC `id`
- request duration
- failed status when a response contains `error`
- server stderr as a warning or failed tool step

Options:

```text
--out <path>      Write the trace to a specific path.
--name <name>     Override the displayed MCP server name.
```

## Local Trace Storage

List recent local traces:

```bash
npm run agentscope -- list
```

Load recorded traces in the UI with **Load Trace**, or use **Scan Folder** on `.agentscope/traces`.

## Privacy Notes

Live captures are raw local records. They may contain private source paths, source code, tokens, command output, and customer data.

Before sharing a capture:

- Load it in the AgentScope UI.
- Use **Sanitized JSON** or **HTML Report**.
- Review the export manually.
