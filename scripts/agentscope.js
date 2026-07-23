#!/usr/bin/env node
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");

const TRACE_DIR = path.join(process.cwd(), ".agentscope", "traces");
const MAX_CAPTURE_CHARS = 240000;
const TRACE_VERSION = "1.0";

function nowIso() {
  return new Date().toISOString();
}

function parseTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function displayTime(value) {
  const date = parseTime(value);
  return date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
}

function durationMs(start, end) {
  const startDate = parseTime(start);
  const endDate = parseTime(end);
  if (!startDate || !endDate) return 0;
  return Math.max(0, endDate.getTime() - startDate.getTime());
}

function safeFilePart(value) {
  return String(value || "trace")
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "trace";
}

function ensureTraceDir(outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
}

function defaultTracePath(prefix) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(TRACE_DIR, `${prefix}-${stamp}.trace.json`);
}

function writeTrace(trace, outPath) {
  ensureTraceDir(outPath);
  fs.writeFileSync(outPath, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
  return outPath;
}

function appendCapped(current, chunk) {
  const next = current + chunk;
  if (next.length <= MAX_CAPTURE_CHARS) return next;
  return `${next.slice(0, MAX_CAPTURE_CHARS)}\n...[truncated]`;
}

function splitArgs(argv) {
  const index = argv.indexOf("--");
  if (index === -1) return { options: argv, command: [] };
  return { options: argv.slice(0, index), command: argv.slice(index + 1) };
}

function readOption(options, name, fallback = "") {
  const index = options.indexOf(name);
  if (index === -1 || index === options.length - 1) return fallback;
  return options[index + 1];
}

function hasOption(options, name) {
  return options.includes(name);
}

function quoteWindowsArg(arg) {
  const value = String(arg);
  if (!value) return '""';
  if (!/[()\s&|<>^"]/.test(value)) return value;
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1")}"`;
}

function commandLineForWindows(command) {
  return command.map(quoteWindowsArg).join(" ");
}

function spawnCommand(command, options) {
  if (process.platform !== "win32") {
    return spawn(command[0], command.slice(1), options);
  }
  return spawn(commandLineForWindows(command), { ...options, shell: true });
}

function makeTrace({ runId, agent, model = "unknown", status, startedAt, endedAt, summary, source, steps }) {
  const failedCount = steps.filter((step) => step.status === "failed").length;
  const warningCount = steps.filter((step) => step.status === "warning").length;
  return {
    traceVersion: TRACE_VERSION,
    runId,
    agent,
    model,
    status: status || (failedCount ? "failed" : "ok"),
    startedAt,
    durationMs: durationMs(startedAt, endedAt),
    tokens: { input: 0, output: 0, total: 0 },
    costUsd: 0,
    riskScore: Math.min(100, failedCount * 30 + warningCount * 12 + steps.length * 3),
    summary,
    source,
    steps,
  };
}

function printHelp() {
  console.log(`AgentScope CLI

Usage:
  agentscope record [--out <path>] [--title <title>] -- <command> [args...]
  agentscope mcp-proxy [--out <path>] [--name <name>] -- <server-command> [args...]
  agentscope list [--dir <path>]

Examples:
  agentscope record -- npm test
  agentscope mcp-proxy -- node ./server.js
`);
}

function listTraces(argv) {
  const dir = path.resolve(readOption(argv, "--dir", TRACE_DIR));
  if (!fs.existsSync(dir)) {
    console.log(`No AgentScope traces found at ${dir}`);
    return;
  }
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      return { file, fullPath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!files.length) {
    console.log(`No AgentScope traces found at ${dir}`);
    return;
  }

  files.slice(0, 50).forEach(({ file, fullPath }) => {
    try {
      const trace = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      console.log(`${file}  ${trace.status || "unknown"}  ${trace.agent || "unknown"}  ${trace.summary || ""}`);
    } catch {
      console.log(`${file}  unreadable`);
    }
  });
}

function recordCommand(argv) {
  const { options, command } = splitArgs(argv);
  if (!command.length || hasOption(options, "--help")) {
    printHelp();
    process.exit(command.length ? 0 : 1);
  }

  const startedAt = nowIso();
  const title = readOption(options, "--title", command.join(" "));
  const outPath = path.resolve(readOption(options, "--out", defaultTracePath("record")));
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  const child = spawnCommand(command, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout = appendCapped(stdout, text);
    process.stdout.write(chunk);
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr = appendCapped(stderr, text);
    process.stderr.write(chunk);
  });

  child.on("error", (error) => {
    stderr = appendCapped(stderr, error.stack || error.message);
    exitCode = 1;
  });

  child.on("close", (code, signal) => {
    const endedAt = nowIso();
    exitCode = typeof code === "number" ? code : exitCode;
    const status = exitCode === 0 && !signal ? "ok" : "failed";
    const step = {
      id: "s1",
      type: "tool",
      title: `Command: ${title}`,
      timestamp: startedAt,
      time: displayTime(startedAt),
      durationMs: durationMs(startedAt, endedAt),
      status,
      tool: "shell.command",
      input: command.join(" "),
      output: [
        stdout ? `STDOUT:\n${stdout.trimEnd()}` : "",
        stderr ? `STDERR:\n${stderr.trimEnd()}` : "",
        `Exit code: ${exitCode}${signal ? `, signal: ${signal}` : ""}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
    const trace = makeTrace({
      runId: `record_${safeFilePart(startedAt)}`,
      agent: "AgentScope Recorder",
      status,
      startedAt,
      endedAt,
      summary: `Recorded command: ${title}`,
      source: {
        kind: "agentscope_record",
        path: outPath,
        cwd: process.cwd(),
        command: command.join(" "),
      },
      steps: [step],
    });

    writeTrace(trace, outPath);
    console.error(`\nAgentScope trace written to ${outPath}`);
    process.exit(exitCode);
  });
}

function createJsonLineReader(onLine) {
  let buffer = "";
  return (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        onLine(JSON.parse(trimmed), line);
      } catch {
        // MCP stdio may include non-JSON diagnostic lines. Preserve transport and skip parsing.
      }
    });
  };
}

function mcpProxy(argv) {
  const { options, command } = splitArgs(argv);
  if (!command.length || hasOption(options, "--help")) {
    printHelp();
    process.exit(command.length ? 0 : 1);
  }

  const startedAt = nowIso();
  const outPath = path.resolve(readOption(options, "--out", defaultTracePath("mcp-proxy")));
  const name = readOption(options, "--name", command[0]);
  const calls = new Map();
  const steps = [];
  let stepId = 1;
  let stderr = "";
  let transportStatus = "ok";

  const server = spawnCommand(command, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  function getCall(id) {
    return calls.get(String(id));
  }

  const readClient = createJsonLineReader((message) => {
    if (message.id !== undefined && message.method) {
      const timestamp = nowIso();
      const step = {
        id: `s${stepId++}`,
        type: "tool",
        title: `MCP Request: ${message.method}`,
        timestamp,
        time: displayTime(timestamp),
        durationMs: 0,
        status: "warning",
        tool: `mcp.${message.method}`,
        input: JSON.stringify(message.params ?? message, null, 2),
        output: "",
        _startedAt: timestamp,
      };
      calls.set(String(message.id), step);
      steps.push(step);
    } else if (message.method) {
      const timestamp = nowIso();
      steps.push({
        id: `s${stepId++}`,
        type: "tool",
        title: `MCP Notification: ${message.method}`,
        timestamp,
        time: displayTime(timestamp),
        durationMs: 0,
        status: "ok",
        tool: `mcp.${message.method}`,
        input: JSON.stringify(message.params ?? message, null, 2),
        output: "",
      });
    }
  });

  const readServer = createJsonLineReader((message) => {
    if (message.id === undefined) return;
    const step = getCall(message.id);
    if (!step) return;
    const endedAt = nowIso();
    step.durationMs = durationMs(step._startedAt, endedAt);
    step.status = message.error ? "failed" : "ok";
    step.output = JSON.stringify(message.error ?? message.result ?? message, null, 2);
  });

  process.stdin.on("data", (chunk) => {
    readClient(chunk);
    server.stdin.write(chunk);
  });

  process.stdin.on("end", () => {
    server.stdin.end();
  });

  server.stdout.on("data", (chunk) => {
    readServer(chunk);
    process.stdout.write(chunk);
  });

  server.stderr.on("data", (chunk) => {
    stderr = appendCapped(stderr, chunk.toString());
    process.stderr.write(chunk);
  });

  server.on("error", (error) => {
    transportStatus = "failed";
    stderr = appendCapped(stderr, error.stack || error.message);
  });

  function finalize(code, signal) {
    const endedAt = nowIso();
    steps.forEach((step) => {
      if (step._startedAt) {
        step.durationMs = step.durationMs || durationMs(step._startedAt, endedAt);
        if (step.status === "warning") step.status = "failed";
        delete step._startedAt;
      }
    });
    if (stderr) {
      steps.push({
        id: `s${stepId++}`,
        type: "tool",
        title: "MCP Server stderr",
        timestamp: endedAt,
        time: displayTime(endedAt),
        durationMs: 0,
        status: code === 0 ? "warning" : "failed",
        tool: "mcp.stderr",
        input: "",
        output: stderr.trimEnd(),
      });
    }
    const status = transportStatus === "failed" || code !== 0 ? "failed" : "ok";
    const trace = makeTrace({
      runId: `mcp_proxy_${safeFilePart(startedAt)}`,
      agent: "AgentScope MCP Proxy",
      status,
      startedAt,
      endedAt,
      summary: `MCP stdio proxy session for ${name}`,
      source: {
        kind: "agentscope_mcp_proxy",
        path: outPath,
        cwd: process.cwd(),
        command: command.join(" "),
      },
      steps,
    });
    writeTrace(trace, outPath);
    console.error(`\nAgentScope MCP trace written to ${outPath}`);
    process.exit(typeof code === "number" ? code : 1);
  }

  server.on("close", finalize);

  process.on("SIGINT", () => {
    transportStatus = "failed";
    server.kill("SIGINT");
  });
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(command ? 0 : 1);
  }
  if (command === "record") return recordCommand(rest);
  if (command === "mcp-proxy") return mcpProxy(rest);
  if (command === "list") return listTraces(rest);
  console.error(`Unknown AgentScope command: ${command}`);
  printHelp();
  process.exit(1);
}

main();
