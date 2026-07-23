import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { marked } from "marked";
import "./styles.css";

const TRACE_VERSION = "1.0";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);

const emptyTrace = {
  traceVersion: TRACE_VERSION,
  runId: "no-trace-loaded",
  agent: "No agent selected",
  model: "waiting for import",
  status: "empty",
  startedAt: null,
  durationMs: 0,
  tokens: { input: 0, output: 0, total: 0 },
  costUsd: 0,
  riskScore: 0,
  summary: "Load a Trace JSON or scan a Codex / Claude Code records folder to begin.",
  steps: [],
};

const statusMeta = {
  ok: { label: "Passed", icon: "OK" },
  warning: { label: "Review", icon: "!" },
  failed: { label: "Failed", icon: "X" },
};

const typeLabels = {
  all: "All",
  prompt: "Prompts",
  reasoning: "Reasoning",
  tool: "Tools",
  diff: "Diffs",
};

const typeDescriptions = {
  all: "Complete execution path",
  prompt: "User and system intent",
  reasoning: "Plans and recovery notes",
  tool: "MCP, shell, and web calls",
  diff: "Code and file changes",
};

const candidateExtensions = [".json", ".jsonl", ".log"];
const candidatePathHints = ["rollout", "session", "transcript", "claude", "codex", "conversation", "cursor", "cline", "agentscope", "trace"];
const redactionToken = "[REDACTED]";
const pathRedactionToken = "[REDACTED_PATH]";
const secretRedactionRules = [
  { label: "OpenAI API key", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{16,}\b/g },
  { label: "AWS access key", pattern: /\b(A3T[A-Z0-9]|AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { label: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { label: "Authorization header", pattern: /\b(Authorization\s*[:=]\s*)(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, replacement: `$1${redactionToken}` },
  { label: "Secret assignment", pattern: /\b(api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|secret|password|passwd|pwd)\b(\s*[:=]\s*)(["']?)[^"'\s,;}]+/gi, replacement: `$1$2$3${redactionToken}` },
  { label: "Private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replacement: redactionToken },
];
const pathRedactionRules = [
  { label: "Windows absolute path", pattern: /\b[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\s\r\n]*/g },
  { label: "Windows user path", pattern: /\\Users\\[^\\\s\r\n]+\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\s\r\n]*/g },
  { label: "POSIX user path", pattern: /(?:^|[\s"'(])\/(?:Users|home)\/[^\s"'<>`]+/g },
  { label: "Tilde path", pattern: /(?:^|[\s"'(])~\/[^\s"'<>`]+/g },
  { label: "File URL", pattern: /file:\/\/\/?[^\s"'<>`]+/gi },
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstPresent(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "");
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== ""));
}

function getPayload(record) {
  return isPlainObject(record?.payload) ? record.payload : {};
}

function getEventTimestamp(record) {
  const payload = getPayload(record);
  const item = isPlainObject(payload.item) ? payload.item : {};
  return firstPresent(record?.timestamp, record?.created_at, record?.createdAt, record?.ts, payload.timestamp, item.timestamp);
}

function formatDuration(ms) {
  if (!ms) return "instant";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms > 10000 ? 0 : 1)}s`;
}

function clampRisk(value) {
  return Math.max(0, Math.min(Number(value || 0), 100));
}

function parseTimestamp(value) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value > 100000000000 ? value : value * 1000);
  const date = new Date(String(value).replace("Z", "+00:00"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function displayTime(value) {
  const date = parseTimestamp(value);
  return date ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
}

function displayDate(value) {
  const date = parseTimestamp(value);
  if (!date) return "Unknown date";
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "2-digit", weekday: "short" });
}

function durationBetween(start, end) {
  const startDate = parseTimestamp(start);
  const endDate = parseTimestamp(end);
  if (!startDate || !endDate) return 0;
  return Math.max(0, endDate.getTime() - startDate.getTime());
}

function contentToText(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.text) return item.text;
        if (item?.content) return contentToText(item.content);
        if (item?.type === "tool_use") return `Tool use: ${item.name || "unknown"} ${JSON.stringify(item.input || {})}`;
        if (item?.type === "tool_result") return `Tool result: ${contentToText(item.content) || item.result || ""}`;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content.text) return content.text;
  if (content.message) return contentToText(content.message);
  if (content.content) return contentToText(content.content);
  return JSON.stringify(content, null, 2);
}

function normalizeContent(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function tryFormatJson(value) {
  const text = normalizeContent(value).trim();
  if (!text) return null;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

function detectLanguage(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```([\w-]+)/);
  if (fenced) return fenced[1];
  if (/^\s*(function|const|let|var|import|export)\s/m.test(text)) return "javascript";
  if (/^\s*(def|class|from|import)\s/m.test(text)) return "python";
  if (/^\s*(npm|pnpm|yarn|git|cd|python|node)\s/m.test(text)) return "bash";
  if (/^\s*</.test(text)) return "xml";
  return "plaintext";
}

function detectContentKind(value) {
  const text = normalizeContent(value).trim();
  if (!text) return "plain";
  if (tryFormatJson(text)) return "json";
  if (/^```[\s\S]*```$/.test(text) || /^\s*(function|const|let|var|import|export|def|class)\s/m.test(text)) return "code";
  if (/(^|\n)\s{0,3}(#{1,6}\s|[-*]\s|\d+\.\s|>\s|```|\|.+\|)/.test(text) || /\[[^\]]+\]\([^)]+\)/.test(text)) return "markdown";
  return "plain";
}

function stripCodeFence(text) {
  const match = text.trim().match(/^```[\w-]*\n?([\s\S]*?)```$/);
  return match ? match[1].trim() : text;
}

function highlightedHtml(text, language) {
  const safeLanguage = hljs.getLanguage(language) ? language : "plaintext";
  return DOMPurify.sanitize(hljs.highlight(text, { language: safeLanguage, ignoreIllegals: true }).value);
}

function markdownHtml(text) {
  return DOMPurify.sanitize(marked.parse(text, { breaks: true }));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeFilePart(path) {
  const normalized = String(path || "").replaceAll("\\", "/");
  const fileName = normalized.split("/").filter(Boolean).at(-1);
  if (!fileName || fileName.startsWith(".")) return "file";
  return fileName;
}

function redactPathLikeString(value, stats) {
  let text = String(value ?? "");
  pathRedactionRules.forEach((rule) => {
    text = text.replace(rule.pattern, (match) => {
      const prefix = /^[\s"'(]/.test(match) ? match[0] : "";
      const rawPath = prefix ? match.slice(1) : match;
      const separator = rawPath.includes("\\") ? "\\" : "/";
      stats.paths += 1;
      stats.ruleHits[rule.label] = (stats.ruleHits[rule.label] || 0) + 1;
      return `${prefix}${pathRedactionToken}${separator}${safeFilePart(rawPath)}`;
    });
  });
  return text;
}

function redactSecretsInString(value, stats) {
  let text = String(value ?? "");
  secretRedactionRules.forEach((rule) => {
    text = text.replace(rule.pattern, (...args) => {
      stats.secrets += 1;
      stats.ruleHits[rule.label] = (stats.ruleHits[rule.label] || 0) + 1;
      if (rule.replacement) {
        return String(rule.replacement).replace(/\$(\d+)/g, (_, index) => args[Number(index)] || "");
      }
      return redactionToken;
    });
  });
  return text;
}

function redactString(value, stats) {
  return redactPathLikeString(redactSecretsInString(value, stats), stats);
}

function redactKnownPath(value, stats) {
  if (!value) return value;
  const raw = String(value);
  if (!/[\\/]|^file:/i.test(raw)) return redactString(raw, stats);
  stats.paths += 1;
  stats.ruleHits["Path field"] = (stats.ruleHits["Path field"] || 0) + 1;
  const separator = raw.includes("\\") ? "\\" : "/";
  return `${pathRedactionToken}${separator}${safeFilePart(raw)}`;
}

function sanitizeTraceForSharing(trace) {
  const stats = { secrets: 0, paths: 0, ruleHits: {} };
  const sanitizedSteps = (trace.steps || []).map((step) => ({
    ...step,
    title: redactString(step.title, stats),
    content: redactString(step.content, stats),
    tool: redactString(step.tool, stats),
    input: redactString(step.input, stats),
    output: redactString(step.output, stats),
    files: step.files?.map((file) => ({
      ...file,
      path: redactKnownPath(file.path, stats),
    })),
  }));
  const sanitized = {
    ...trace,
    runId: redactString(trace.runId, stats),
    agent: redactString(trace.agent, stats),
    model: redactString(trace.model, stats),
    summary: redactString(trace.summary, stats),
    source: trace.source
      ? compactObject({
          ...trace.source,
          path: redactKnownPath(trace.source.path, stats),
          cwd: redactKnownPath(trace.source.cwd, stats),
          threadId: trace.source.threadId ? redactionToken : undefined,
          sessionId: trace.source.sessionId ? redactionToken : undefined,
        })
      : undefined,
    steps: sanitizedSteps,
    sharing: {
      sanitizedAt: new Date().toISOString(),
      mode: "sanitized",
      redactions: {
        secrets: stats.secrets,
        paths: stats.paths,
        rules: stats.ruleHits,
      },
    },
  };
  return { trace: sanitized, stats };
}

function downloadBlob(content, fileName, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeDownloadName(value) {
  return String(value || "agentscope")
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "agentscope";
}

function reportStatusLabel(status) {
  return statusMeta[status]?.label || status || "Unknown";
}

function buildStaticHtmlReport(trace, stats) {
  const generatedAt = new Date().toISOString();
  const steps = trace.steps || [];
  const counts = steps.reduce(
    (acc, step) => {
      acc[step.type] = (acc[step.type] || 0) + 1;
      return acc;
    },
    { all: steps.length },
  );
  const eventCards = steps
    .map((step, index) => {
      const files = step.files?.length
        ? `<div class="files">${step.files
            .map((file) => `<div><code>${escapeHtml(file.path)}</code><span>+${escapeHtml(file.adds)} / -${escapeHtml(file.deletes)}</span></div>`)
            .join("")}</div>`
        : "";
      const io = step.tool
        ? `<div class="io"><h4>Tool</h4><pre>${escapeHtml(step.tool)}</pre><h4>Input</h4><pre>${escapeHtml(step.input || "n/a")}</pre><h4>Output</h4><pre>${escapeHtml(step.output || "n/a")}</pre></div>`
        : "";
      return `<article class="event ${escapeHtml(step.status)}">
        <header><span>#${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(step.title)}</strong><em>${escapeHtml(step.type)} / ${escapeHtml(reportStatusLabel(step.status))}</em></header>
        <p>${escapeHtml(step.timestamp || step.time || "No timestamp")}</p>
        <pre>${escapeHtml(step.content || "No narrative content captured.")}</pre>
        ${io}
        ${files}
      </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AgentScope Static Report - ${escapeHtml(trace.runId)}</title>
  <style>
    :root{color:#162234;background:#eef5fd;font-family:Verdana,Georgia,sans-serif}*{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,#f7fbff,#e8f1fb);}.shell{max-width:1180px;margin:0 auto;padding:28px}.hero,.card,.event{border:1px solid #d7e0ec;border-radius:18px;background:#fff;box-shadow:0 12px 34px rgba(7,22,41,.08)}.hero{display:grid;grid-template-columns:1fr auto;gap:18px;padding:24px;margin-bottom:16px;background:linear-gradient(135deg,#fff,#f3f8ff)}h1{margin:0 0 8px;color:#071629;font-family:Georgia,serif;font-size:36px;letter-spacing:-.04em}.hero p{margin:0;color:#41516a;line-height:1.5}.badge{display:inline-grid;place-items:center;border-radius:999px;padding:8px 12px;color:#fff;background:#1d5fae;font-weight:800}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px}.card{padding:14px}.card span{display:block;color:#6c7a90;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.card strong{display:block;margin-top:4px;color:#071629;font-size:22px}.notice{border-left:4px solid #16875d}.events{display:grid;gap:12px}.event{overflow:hidden}.event header{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:12px 14px;background:#f3f8ff;border-bottom:1px solid #d7e0ec}.event header span,.event header em{color:#1d5fae;font-size:12px;font-style:normal;font-weight:800}.event.failed header em{color:#c4342d}.event.warning header em{color:#b76b00}.event p{margin:12px 14px 0;color:#6c7a90;font-size:12px}pre{margin:12px 14px;padding:12px;overflow:auto;border-radius:12px;color:#d7e8ff;background:#071629;white-space:pre-wrap}.io h4{margin:12px 14px 0;color:#41516a;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.files{display:grid;gap:8px;margin:12px 14px 14px}.files div{display:flex;justify-content:space-between;gap:12px;border:1px solid #d7e0ec;border-radius:10px;padding:9px;background:#f8fbff}code{overflow-wrap:anywhere;color:#12345d}@media(max-width:760px){.shell{padding:14px}.hero,.grid{grid-template-columns:1fr}.event header{grid-template-columns:1fr}.files div{display:grid}}
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div>
        <span class="badge">Static Report</span>
        <h1>${escapeHtml(trace.agent)} trace</h1>
        <p>${escapeHtml(trace.summary || "Sanitized AgentScope trace report.")}</p>
      </div>
      <div class="card notice">
        <span>Generated</span>
        <strong>${escapeHtml(displayDate(generatedAt))}</strong>
      </div>
    </section>
    <section class="grid" aria-label="Report metrics">
      <div class="card"><span>Run ID</span><strong>${escapeHtml(trace.runId)}</strong></div>
      <div class="card"><span>Status</span><strong>${escapeHtml(trace.status)}</strong></div>
      <div class="card"><span>Events</span><strong>${steps.length}</strong></div>
      <div class="card"><span>Tools</span><strong>${counts.tool || 0}</strong></div>
      <div class="card"><span>Redactions</span><strong>${stats.secrets + stats.paths}</strong></div>
    </section>
    <section class="card notice">
      <span>Privacy</span>
      <p>This report was generated from AgentScope sanitized export. Automatic redaction found ${stats.secrets} secret-like value(s) and ${stats.paths} path value(s). Review before public sharing.</p>
    </section>
    <section class="events" aria-label="Events">${eventCards}</section>
  </main>
</body>
</html>`;
}

function addImportDiagnostic(diagnostics, level, path, message, details = {}) {
  diagnostics?.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, level, path, message, ...details });
}

function parseJsonLines(text, sourceName, diagnostics) {
  const records = [];
  const errors = [];

  text
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line) return;
      try {
        records.push(JSON.parse(line));
      } catch (error) {
        const message = `line ${index + 1}: ${error.message}`;
        errors.push(message);
        addImportDiagnostic(diagnostics, "warning", sourceName, `Skipped invalid JSONL ${message}`);
      }
    });

  if (!records.length && errors.length) {
    throw new Error(`Could not parse JSONL. ${errors[0]}`);
  }

  return records;
}

function makeStep(id, type, title, timestamp, status, content, extras = {}) {
  return {
    id: `s${id}`,
    type,
    title,
    timestamp,
    time: displayTime(timestamp),
    durationMs: 0,
    status,
    content: contentToText(content),
    ...extras,
  };
}

function normalizeTrace(trace) {
  return { ...trace, traceVersion: trace.traceVersion || TRACE_VERSION };
}

function buildTrace({ runId, agent, model, status, summary, source, records, steps }) {
  const timestamps = (records || []).map(getEventTimestamp).filter(Boolean);
  const first = timestamps[0];
  const last = timestamps.at(-1);
  const failedCount = steps.filter((step) => step.status === "failed").length;
  const diffCount = steps.filter((step) => step.type === "diff").length;
  const toolCount = steps.filter((step) => step.type === "tool").length;

  return {
    traceVersion: TRACE_VERSION,
    runId,
    agent,
    model: model || "unknown",
    status: status || (failedCount ? "failed" : "ok"),
    startedAt: first || new Date().toISOString(),
    durationMs: durationBetween(first, last),
    tokens: { input: 0, output: 0, total: 0 },
    costUsd: 0,
    riskScore: Math.min(100, failedCount * 28 + diffCount * 9 + toolCount * 3),
    summary,
    source: compactObject({ ...source, recordCount: records?.length || 0 }),
    steps,
  };
}

function outputLooksFailed(text) {
  return /\b(error|failed|exception|traceback|exit code:\s*[1-9]|status:\s*[1-9]\d\d)\b/i.test(String(text || ""));
}

function getCodexItem(event) {
  const payload = getPayload(event);
  return payload.type === "response_item" && isPlainObject(payload.item) ? payload.item : payload;
}

function getCodexEventType(event) {
  const payload = getPayload(event);
  const item = getCodexItem(event);
  return firstPresent(item.type, payload.type, event?.type);
}

function extractTokenUsage(value) {
  const usage =
    value?.usage ||
    value?.token_usage ||
    value?.total_token_usage ||
    value?.info?.total_token_usage ||
    value?.payload?.usage ||
    value?.payload?.info?.total_token_usage;

  if (!isPlainObject(usage)) return null;

  const input = Number(firstPresent(usage.input_tokens, usage.prompt_tokens, usage.input, 0));
  const output = Number(firstPresent(usage.output_tokens, usage.completion_tokens, usage.output, 0));
  const total = Number(firstPresent(usage.total_tokens, usage.total, input + output));
  return { input, output, total };
}

function extractCodexMetadata(records, sourceName) {
  const meta = {
    runId: sourceName.replace(/\W+/g, "_"),
    agent: "Codex",
    model: "",
    title: "",
    cwd: "",
    threadId: "",
    sessionId: "",
    cliVersion: "",
    status: "",
  };

  records.forEach((event) => {
    const payload = getPayload(event);
    const item = getCodexItem(event);
    const source = { ...event, ...payload, ...item };
    const type = getCodexEventType(event);

    if (type === "session_meta" || type === "session_config" || type === "turn_context" || event.type === "session_meta") {
      meta.agent = firstPresent(source.originator, source.agent, meta.agent);
      meta.model = firstPresent(source.model, source.model_slug, meta.model);
      meta.cwd = firstPresent(source.cwd, source.working_directory, source.workdir, meta.cwd);
      meta.threadId = firstPresent(source.thread_id, source.threadId, source.conversation_id, meta.threadId);
      meta.sessionId = firstPresent(source.session_id, source.sessionId, source.id, meta.sessionId);
      meta.cliVersion = firstPresent(source.cli_version, source.version, meta.cliVersion);
      meta.title = firstPresent(source.title, source.name, meta.title);
    }

    meta.model = firstPresent(source.model, source.model_slug, meta.model);
    meta.threadId = firstPresent(source.thread_id, source.threadId, source.conversation_id, meta.threadId);
    meta.sessionId = firstPresent(source.session_id, source.sessionId, meta.sessionId);
    meta.title = firstPresent(source.title, meta.title);

    if (type === "task_complete" || type === "turn_complete") {
      meta.status = source.success === false || source.status === "failed" ? "failed" : firstPresent(source.status, meta.status);
    }
  });

  meta.runId = firstPresent(meta.threadId, meta.sessionId, meta.runId);
  if (/codex/i.test(meta.agent) && !/cli/i.test(meta.agent)) meta.agent = "Codex CLI";
  return meta;
}

function convertCodexRecords(records, sourceName) {
  const steps = [];
  const calls = new Map();
  let stepId = 1;
  let tokens = { input: 0, output: 0, total: 0 };
  const meta = extractCodexMetadata(records, sourceName);

  records.forEach((event) => {
    const timestamp = getEventTimestamp(event);
    const payload = getCodexItem(event);
    const type = getCodexEventType(event);
    const role = payload.role;

    if (type === "user_message" || (type === "message" && role === "user")) {
      steps.push(makeStep(stepId++, "prompt", "User Request", timestamp, "ok", payload.message || payload.content || payload.text));
    } else if (type === "system_message" || type === "developer_message") {
      steps.push(makeStep(stepId++, "prompt", type === "system_message" ? "System Instruction" : "Developer Instruction", timestamp, "ok", payload.message || payload.content || payload.text));
    } else if (type === "agent_message" || type === "agent_reasoning" || type === "reasoning" || (type === "message" && role === "assistant")) {
      const content = payload.message || payload.text || payload.summary || payload.content || payload.output_text;
      steps.push(makeStep(stepId++, "reasoning", type === "agent_message" || type === "message" ? "Agent Message" : "Agent Reasoning", timestamp, "ok", content));
    } else if (/^(function_call|custom_tool_call|web_search_call|local_shell_call|mcp_call)$/.test(type) || (type?.endsWith("_call") && type !== "task_complete")) {
      const name = firstPresent(payload.name, payload.action?.type, payload.server_label, payload.tool, type, "tool");
      const callId = payload.call_id || payload.id || `call_${stepId}`;
      const step = makeStep(stepId++, "tool", `Tool Call: ${name}`, timestamp, "ok", "", {
        tool: name,
        input: contentToText(firstPresent(payload.arguments, payload.input, payload.action, payload.command, "")),
        output: "",
        _startedAt: timestamp,
      });
      calls.set(callId, step);
      steps.push(step);
    } else if (type === "function_call_output" || type === "custom_tool_call_output" || type === "web_search_end" || type?.endsWith("_call_output")) {
      const callId = payload.call_id || payload.id;
      const step = calls.get(callId);
      const output = contentToText(payload.output || payload.query || payload);
      if (step) {
        step.output = output;
        step.durationMs = durationBetween(step._startedAt, timestamp);
        if (outputLooksFailed(output)) step.status = "failed";
      } else {
        steps.push(makeStep(stepId++, "tool", "Tool Output", timestamp, outputLooksFailed(output) ? "failed" : "ok", output));
      }
    } else if (type === "patch_apply_end") {
      const files = Object.entries(payload.changes || {}).map(([path, change]) => ({
        path,
        adds: String(change?.content || "").split(/\r?\n/).filter(Boolean).length,
        deletes: String(change?.previous_content || change?.old_content || "").split(/\r?\n/).filter(Boolean).length,
      }));
      steps.push(makeStep(stepId++, "diff", payload.success === false ? "Patch Failed" : "Patch Applied", timestamp, payload.success === false ? "failed" : "ok", payload.stdout || payload.stderr || "", { files }));
    } else if (type === "token_count") {
      tokens = extractTokenUsage(payload) || tokens;
    }

    tokens = extractTokenUsage(event) || extractTokenUsage(payload) || tokens;
  });

  steps.forEach((step) => delete step._startedAt);
  const trace = buildTrace({
    runId: meta.runId,
    agent: meta.agent,
    model: meta.model || "codex",
    status: meta.status === "failed" ? "failed" : undefined,
    summary: meta.title || `Codex trace imported from ${sourceName}`,
    source: {
      kind: "codex_rollout",
      path: sourceName,
      threadId: meta.threadId,
      sessionId: meta.sessionId,
      cwd: meta.cwd,
      cliVersion: meta.cliVersion,
    },
    records,
    steps,
  });
  trace.tokens = tokens;
  return trace;
}

function convertClaudeRecords(records, sourceName) {
  const steps = [];
  const toolSteps = new Map();
  let stepId = 1;
  const model = records.find((record) => record.message?.model || record.model)?.message?.model || records.find((record) => record.model)?.model;

  function pairToolResult(block, timestamp, fallbackTitle = "Tool Result") {
    const toolUseId = block?.tool_use_id || block?.id;
    const output = contentToText(firstPresent(block?.content, block?.result, block?.output, block));
    const step = toolSteps.get(toolUseId);

    if (step) {
      step.output = output;
      step.durationMs = durationBetween(step._startedAt, timestamp);
      if (block?.is_error || outputLooksFailed(output)) step.status = "failed";
      return;
    }

    steps.push(makeStep(stepId++, "tool", fallbackTitle, timestamp, block?.is_error || outputLooksFailed(output) ? "failed" : "ok", "", {
      tool: block?.name || "claude.tool_result",
      input: toolUseId ? `tool_use_id: ${toolUseId}` : "",
      output,
    }));
  }

  records.forEach((record) => {
    const timestamp = getEventTimestamp(record);
    const role = record.message?.role || record.role || record.type;
    const message = record.message || record;
    const content = message.content || record.content || record.text;
    const blocks = Array.isArray(content) ? content : [content].filter(Boolean);
    const toolResultBlocks = blocks.filter((block) => block?.type === "tool_result" || block?.tool_use_id);

    if (toolResultBlocks.length) {
      toolResultBlocks.forEach((block) => pairToolResult(block, timestamp));
      const promptText = blocks
        .filter((block) => !(block?.type === "tool_result" || block?.tool_use_id))
        .map(contentToText)
        .filter(Boolean)
        .join("\n");
      if (role === "user" && promptText) steps.push(makeStep(stepId++, "prompt", "User Prompt", timestamp, "ok", promptText));
      return;
    }

    if (role === "assistant") {
      const text = blocks.filter((block) => typeof block === "string" || block?.text).map(contentToText).join("\n");
      if (text) steps.push(makeStep(stepId++, "reasoning", "Assistant Message", timestamp, "ok", text));

      blocks
        .filter((block) => block?.type === "tool_use")
        .forEach((block) => {
          const step = makeStep(stepId++, "tool", `Tool Call: ${block.name || "Claude Tool"}`, timestamp, "ok", "", {
            tool: block.name || "claude.tool",
            input: contentToText(block.input || ""),
            output: "",
            _startedAt: timestamp,
          });
          if (block.id) toolSteps.set(block.id, step);
          steps.push(step);
        });
      return;
    }

    if (role === "user") {
      steps.push(makeStep(stepId++, "prompt", "User Prompt", timestamp, "ok", content));
      return;
    }

    if (role === "tool_result" || record.type === "tool_result") {
      pairToolResult({ ...record, content }, timestamp);
    }
  });

  steps.forEach((step) => delete step._startedAt);
  return buildTrace({
    runId: sourceName.replace(/\W+/g, "_"),
    agent: "Claude Code",
    model: model || "claude",
    summary: `Claude Code trace imported from ${sourceName}`,
    source: { kind: "claude_code_jsonl", path: sourceName },
    records,
    steps,
  });
}

function convertGenericRecords(records, sourceName) {
  let stepId = 1;
  const steps = records
    .map((record) => {
      const timestamp = record.timestamp || record.created_at || record.ts;
      const role = record.role || record.type || record.kind || "event";
      const content = record.content || record.message || record.text || record.output || record;
      const lower = String(role).toLowerCase();
      if (lower.includes("user")) return makeStep(stepId++, "prompt", "User Event", timestamp, "ok", content);
      if (lower.includes("tool") || lower.includes("function")) return makeStep(stepId++, "tool", "Tool Event", timestamp, "ok", "", { tool: role, input: contentToText(record.input || record.arguments || ""), output: contentToText(record.output || content) });
      return makeStep(stepId++, "reasoning", "Agent Event", timestamp, "ok", content);
    })
    .filter((step) => step.content || step.input || step.output);

  return buildTrace({
    runId: sourceName.replace(/\W+/g, "_"),
    agent: "Generic AI Tool",
    model: "unknown",
    summary: `Generic AI trace imported from ${sourceName}`,
    source: { kind: "generic_jsonl", path: sourceName },
    records,
    steps,
  });
}

function detectAndConvert(records, sourceName) {
  if (!records.length) throw new Error("No records found.");
  if (records[0]?.steps && Array.isArray(records[0].steps)) return normalizeTrace(records[0]);
  if (records.some((record) => ["session_meta", "response_item", "user_message", "function_call", "custom_tool_call"].includes(record.payload?.type) || ["user_message", "function_call", "custom_tool_call"].includes(getCodexEventType(record)))) {
    return convertCodexRecords(records, sourceName);
  }
  if (records.some((record) => record.message?.role || record.type === "assistant" || record.type === "user")) {
    return convertClaudeRecords(records, sourceName);
  }
  return convertGenericRecords(records, sourceName);
}

async function importTraceFile(file, diagnostics) {
  const text = await file.text();
  const sourceName = file.webkitRelativePath || file.name;
  const trimmed = text.trim();
  if (!trimmed) throw new Error("File is empty.");

  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed);
      if (Array.isArray(json.steps)) return normalizeTrace(json);
      return detectAndConvert([json], sourceName);
    } catch {
      const records = parseJsonLines(trimmed, sourceName, diagnostics);
      return detectAndConvert(records, sourceName);
    }
  }

  if (trimmed.startsWith("[")) {
    const json = JSON.parse(trimmed);
    if (Array.isArray(json) && json[0]?.steps) return normalizeTrace(json[0]);
    if (Array.isArray(json)) return detectAndConvert(json, sourceName);
  }

  const records = parseJsonLines(trimmed, sourceName, diagnostics);
  return detectAndConvert(records, sourceName);
}

function isCandidateFile(file) {
  const path = (file.webkitRelativePath || file.name).toLowerCase();
  const hasExtension = candidateExtensions.some((extension) => path.endsWith(extension));
  const hasHint = candidatePathHints.some((hint) => path.includes(hint));
  return hasExtension && (hasHint || path.endsWith(".jsonl"));
}

function describeImportCandidate(candidate, index) {
  const { file, trace } = candidate;
  const path = file.webkitRelativePath || file.name;
  return {
    id: `${index}_${path}_${file.lastModified || 0}`,
    path,
    modifiedAt: file.lastModified ? new Date(file.lastModified).toISOString() : "",
    events: trace.steps?.length || 0,
    agent: trace.agent || "unknown",
    model: trace.model || "unknown",
    status: trace.status || "unknown",
    startedAt: trace.startedAt || "",
    sourceKind: trace.source?.kind || "unknown",
    trace,
  };
}

function summarizeTrace(trace) {
  const steps = trace.steps || [];
  return {
    events: steps.length,
    prompts: steps.filter((step) => step.type === "prompt").length,
    tools: steps.filter((step) => step.type === "tool").length,
    diffs: steps.filter((step) => step.type === "diff").length,
    failures: steps.filter((step) => step.status === "failed").length,
    changedFiles: steps.reduce((sum, step) => sum + (step.files?.length ?? 0), 0),
    durationMs: Number(trace.durationMs || 0),
    tokens: Number(trace.tokens?.total || 0),
    riskScore: clampRisk(trace.riskScore),
  };
}

function compareTraceSummaries(baseTrace, comparisonTrace) {
  const base = summarizeTrace(baseTrace);
  const compare = summarizeTrace(comparisonTrace);
  return Object.entries(base).map(([key, baseValue]) => ({
    key,
    baseValue,
    compareValue: compare[key],
    delta: compare[key] - baseValue,
  }));
}

function ContentBlock({ label, value, preferredKind }) {
  const raw = normalizeContent(value);
  const kind = preferredKind || detectContentKind(raw);
  const [mode, setMode] = useState(kind === "markdown" ? "preview" : "formatted");

  useEffect(() => {
    setMode(kind === "markdown" ? "preview" : "formatted");
  }, [kind, raw]);

  const formattedJson = kind === "json" ? tryFormatJson(raw) : null;
  const codeText = kind === "code" ? stripCodeFence(raw) : formattedJson || raw;
  const language = kind === "json" ? "json" : detectLanguage(raw);
  const canPreview = kind === "markdown";
  const isHighlighted = kind === "json" || kind === "code";

  async function copyContent() {
    const copied = mode === "formatted" && formattedJson ? formattedJson : raw;
    await navigator.clipboard?.writeText(copied);
  }

  return (
    <section className={`content-block ${kind}`}>
      <div className="content-toolbar">
        <div>
          <span className="section-label">{label}</span>
          <em>{kind}</em>
        </div>
        <div className="content-actions">
          {canPreview && (
            <>
              <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}>
                Preview
              </button>
              <button className={mode === "source" ? "active" : ""} onClick={() => setMode("source")}>
                Source
              </button>
            </>
          )}
          {isHighlighted && (
            <>
              <button className={mode === "formatted" ? "active" : ""} onClick={() => setMode("formatted")}>
                Formatted
              </button>
              <button className={mode === "source" ? "active" : ""} onClick={() => setMode("source")}>
                Source
              </button>
            </>
          )}
          <button onClick={copyContent}>Copy</button>
        </div>
      </div>

      {kind === "markdown" && mode === "preview" ? (
        <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: markdownHtml(raw) }} />
      ) : isHighlighted && mode === "formatted" ? (
        <pre className={`code-preview language-${language}`}>
          <code dangerouslySetInnerHTML={{ __html: highlightedHtml(codeText, language) }} />
        </pre>
      ) : (
        <pre className="source-preview">
          <code>{raw || "No content captured."}</code>
        </pre>
      )}
    </section>
  );
}

function MetricCard({ label, value, hint, tone }) {
  return (
    <article className={`metric-card ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function TopBar({ trace, onUpload, onFolderUpload, onCompareUpload, onExport, onSanitizedExport, onHtmlReport, importStatus }) {
  return (
    <header className="top-bar">
      <div className="brand-lockup">
        <span className="brand-mark">AS</span>
        <div>
          <strong>AgentScope</strong>
          <small>Business Agent Trace Console</small>
        </div>
      </div>
      <nav className="top-menu" aria-label="Main menu">
        <a href="#overview">Overview</a>
        <a href="#timeline">Timeline</a>
        <a href="#inspector">Inspector</a>
      </nav>
      <div className="run-meta">
        <span>{trace.agent}</span>
        <code>{trace.runId}</code>
        {importStatus && <small className="import-status">{importStatus}</small>}
      </div>
      <div className="top-actions">
        <label className="action primary-action">
          Load Trace
          <input type="file" accept=".json,.jsonl" onChange={onUpload} />
        </label>
        <label className="action folder-action">
          Scan Folder
          <input type="file" webkitdirectory="true" directory="true" multiple onChange={onFolderUpload} />
        </label>
        <label className="action compare-action">
          Compare
          <input type="file" accept=".json,.jsonl" onChange={onCompareUpload} />
        </label>
        <button className="action ghost-action" onClick={onExport}>
          Export JSON
        </button>
        <button className="action safe-action" onClick={onSanitizedExport}>
          Sanitized JSON
        </button>
        <button className="action report-action" onClick={onHtmlReport}>
          HTML Report
        </button>
      </div>
    </header>
  );
}

function ImportDiagnostics({ diagnostics }) {
  const recent = diagnostics.slice(0, 8);

  return (
    <section className="diagnostics-panel" aria-label="Import diagnostics">
      <div className="diagnostics-heading">
        <strong>Import Diagnostics</strong>
        <span>{diagnostics.length}</span>
      </div>
      {recent.length ? (
        <div className="diagnostics-list">
          {recent.map((item) => (
            <article className={`diagnostic-row ${item.level}`} key={item.id}>
              <strong>{item.level}</strong>
              <p>{item.message}</p>
              <code>{item.path}</code>
            </article>
          ))}
        </div>
      ) : (
        <p className="diagnostics-empty">No import issues recorded yet.</p>
      )}
    </section>
  );
}

function PrivacyPanel({ stats }) {
  const total = stats.secrets + stats.paths;

  return (
    <section className="privacy-panel" aria-label="Privacy redaction summary">
      <div className="privacy-heading">
        <strong>Privacy Guard</strong>
        <span>{total}</span>
      </div>
      <p>Sanitized exports redact secret-like values and local file paths before sharing.</p>
      <div className="privacy-stats">
        <div>
          <span>Secrets</span>
          <strong>{stats.secrets}</strong>
        </div>
        <div>
          <span>Paths</span>
          <strong>{stats.paths}</strong>
        </div>
      </div>
    </section>
  );
}

function ImportPicker({ candidates, onSelect, onCancel }) {
  if (!candidates.length) return null;

  return (
    <div className="picker-backdrop" role="presentation">
      <section className="import-picker" role="dialog" aria-modal="true" aria-labelledby="import-picker-title">
        <div className="picker-header">
          <div>
            <span className="eyebrow">Folder Scan</span>
            <h2 id="import-picker-title">Choose a trace to load</h2>
          </div>
          <button className="picker-close" onClick={onCancel}>
            Close
          </button>
        </div>
        <div className="picker-list">
          {candidates.map((candidate, index) => (
            <article className="picker-card" key={candidate.id}>
              <div>
                <div className="picker-title">
                  <strong>{candidate.path}</strong>
                  {index === 0 && <span>Best match</span>}
                </div>
                <p>
                  {candidate.agent} / {candidate.model} / {candidate.sourceKind}
                </p>
                <small>
                  {candidate.events} events / started {displayDate(candidate.startedAt)} / modified{" "}
                  {candidate.modifiedAt ? displayDate(candidate.modifiedAt) : "unknown"}
                </small>
              </div>
              <button onClick={() => onSelect(candidate)}>Load</button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function FilterRail({ filter, onFilterChange, counts, diagnostics, privacyStats }) {
  return (
    <aside className="filter-rail">
      <div className="rail-heading">
        <span className="eyebrow">Function Menu</span>
        <h2>Trace Filters</h2>
      </div>
      <nav className="lane-list" aria-label="Trace filters">
        {Object.entries(typeLabels).map(([key, label]) => (
          <button className={filter === key ? "active" : ""} key={key} onClick={() => onFilterChange(key)}>
            <span>
              <strong>{label}</strong>
              <small>{typeDescriptions[key]}</small>
            </span>
            <em>{counts[key] ?? 0}</em>
          </button>
        ))}
      </nav>
      <div className="rail-note">
        <strong>Workflow</strong>
        <p>Load a trace, choose an event lane, inspect the detail, then export the evidence.</p>
      </div>
      <PrivacyPanel stats={privacyStats} />
      <ImportDiagnostics diagnostics={diagnostics} />
    </aside>
  );
}

function HeroPanel({ trace, failures }) {
  const risk = clampRisk(trace.riskScore);
  const isEmpty = !trace.steps?.length;

  return (
    <section className="hero-panel" id="overview">
      <div className="hero-text">
        <span className="eyebrow">{isEmpty ? "Empty Workspace" : "Run Overview"}</span>
        <h1>{isEmpty ? "No trace loaded." : "Agent execution control room."}</h1>
        <p>{trace.summary}</p>
      </div>
      <div className="risk-console">
        <div className="console-header">
          <span className="live-dot" />
          <span>{trace.model}</span>
        </div>
        <strong>{risk}</strong>
        <small>risk score / 100</small>
        <div className="risk-meter" aria-label={`Risk score ${risk} out of 100`}>
          <span style={{ width: `${risk}%` }} />
        </div>
        <p>{failures ? `${failures} failed event needs review` : "No failed events detected"}</p>
      </div>
    </section>
  );
}

function TraceComparisonPanel({ trace, comparisonTrace, onClear }) {
  if (!comparisonTrace) return null;
  const rows = compareTraceSummaries(trace, comparisonTrace);

  function displayCompareValue(key, value) {
    if (key === "durationMs") return formatDuration(value);
    if (key === "tokens") return value.toLocaleString();
    return value;
  }

  function displayDelta(row) {
    const prefix = row.delta > 0 ? "+" : row.delta < 0 ? "-" : "";
    const magnitude = Math.abs(row.delta);
    if (row.key === "durationMs") return `${prefix}${formatDuration(magnitude)}`;
    return `${prefix}${magnitude.toLocaleString()}`;
  }

  return (
    <section className="comparison-panel" aria-label="Trace comparison">
      <div className="comparison-heading">
        <div>
          <span className="eyebrow">Trace Compare</span>
          <h2>{comparisonTrace.runId || "comparison trace"}</h2>
        </div>
        <button onClick={onClear}>Clear</button>
      </div>
      <div className="comparison-grid">
        {rows.map((row) => (
          <article className="comparison-card" key={row.key}>
            <span>{row.key}</span>
            <strong>
              {displayCompareValue(row.key, row.compareValue)}
              <em className={row.delta > 0 ? "up" : row.delta < 0 ? "down" : ""}>
                {displayDelta(row)}
              </em>
            </strong>
            <small>Base: {displayCompareValue(row.key, row.baseValue)}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function Timeline({ steps, activeId, onSelect, traceStartedAt }) {
  if (!steps.length) {
    return (
      <section className="timeline empty-timeline">
        <h3>No events in this lane</h3>
        <p>Choose another lane or load a trace that includes this event type.</p>
      </section>
    );
  }

  const groups = steps.reduce((acc, step, index) => {
    const sourceDate = step.timestamp || traceStartedAt;
    const key = displayDate(sourceDate);
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push({ step, index });
    return acc;
  }, new Map());

  return (
    <section className="timeline" id="timeline" aria-label="Agent run timeline">
      {[...groups.entries()].map(([date, items]) => (
        <div className="timeline-day" key={date}>
          <div className="timeline-day-header">
            <span className="day-dot" />
            <strong>{date}</strong>
            <em>{items.length} events</em>
          </div>
          <div className="timeline-day-events">
            {items.map(({ step, index }) => (
              <button
                className={`timeline-item ${step.status} ${activeId === step.id ? "active" : ""}`}
                data-active={activeId === step.id ? "true" : "false"}
                key={step.id}
                onClick={() => onSelect(step)}
              >
                <span className="event-time">{step.time || "--:--:--"}</span>
                <span className={`event-node ${step.type}`}>{statusMeta[step.status]?.icon}</span>
                <span className="event-copy">
                  <strong>{step.title}</strong>
                  <small>
                    #{String(index + 1).padStart(2, "0")} / {typeLabels[step.type] || step.type} / {formatDuration(step.durationMs)}
                  </small>
                </span>
                <span className={`event-status ${step.status}`}>{statusMeta[step.status]?.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function ReviewToolbar({
  steps,
  selected,
  position,
  filter,
  search,
  onSearch,
  onJump,
  onFirst,
  onPrev,
  onNext,
  onLast,
  canPrev,
  canNext,
}) {
  return (
    <section className="review-toolbar" aria-label="Timeline review controls">
      <div className="review-primary">
        <button className="nav-button subtle" onClick={onFirst} disabled={!canPrev}>
          First
        </button>
        <button className="nav-button" onClick={onPrev} disabled={!canPrev}>
          Previous
        </button>
        <div className="review-position">
          <span>{typeLabels[filter]} Review</span>
          <strong>
            {position || 0} / {steps.length}
          </strong>
        </div>
        <button className="nav-button" onClick={onNext} disabled={!canNext}>
          Next
        </button>
        <button className="nav-button subtle" onClick={onLast} disabled={!canNext}>
          Last
        </button>
      </div>

      <div className="review-secondary">
        <label className="search-box">
          <span>Search</span>
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Find prompt, tool, file, error..."
          />
        </label>
        <label className="jump-box">
          <span>Jump to</span>
          <select value={selected?.id || ""} onChange={(event) => onJump(event.target.value)}>
            {steps.length ? (
              steps.map((step, index) => (
                <option key={step.id} value={step.id}>
                  {String(index + 1).padStart(2, "0")} - {step.title}
                </option>
              ))
            ) : (
              <option value="">No events</option>
            )}
          </select>
        </label>
      </div>

      <div className="shortcut-strip">
        <span>Shortcuts</span>
        <kbd>Left/Up</kbd>
        <em>previous</em>
        <kbd>Right/Down</kbd>
        <em>next</em>
        <kbd>P</kbd>
        <em>prompts</em>
        <kbd>A</kbd>
        <em>all</em>
      </div>
    </section>
  );
}

function StepDetails({ step, position, total, canPrev, canNext, onPrev, onNext }) {
  if (!step) {
    return (
      <aside className="inspector empty-state" id="inspector">
        <span className="scanner" />
        <h3>Select an event</h3>
        <p>Inspect prompts, MCP tool inputs, outputs, diffs, timing, and recovery notes.</p>
      </aside>
    );
  }

  return (
    <aside className="inspector" id="inspector">
      <div className="inspector-fixed">
        <div className="inspector-top">
          <span className={`type-pill ${step.type}`}>{step.type}</span>
          <span className={`status-chip ${step.status}`}>{statusMeta[step.status]?.label}</span>
        </div>
        <div className="event-navigator" aria-label="Event navigation">
          <button onClick={onPrev} disabled={!canPrev}>
            Previous
          </button>
          <span>
            Event {position} / {total}
          </span>
          <button onClick={onNext} disabled={!canNext}>
            Next
          </button>
        </div>
        <h2>{step.title}</h2>
      </div>

      <div className="inspector-scroll">
        <ContentBlock
          label={step.type === "prompt" ? "Prompt content" : "Event content"}
          value={step.content || "No narrative content captured for this event."}
          preferredKind={step.type === "prompt" ? undefined : undefined}
        />

        {step.tool && (
          <div className="io-stack">
            <ContentBlock label="Tool" value={step.tool} preferredKind="plain" />
            <ContentBlock label="Input" value={step.input || "n/a"} />
            <ContentBlock label="Output" value={step.output || "n/a"} />
          </div>
        )}

        {step.files && (
          <div className="file-list">
            <span className="section-label">Changed files</span>
            {step.files.map((file) => (
              <div className="file-row" key={file.path}>
                <code>{file.path}</code>
                <span>
                  +{file.adds} / -{file.deletes}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <dl className="mini-stats inspector-stats">
        <div>
          <dt>Time</dt>
          <dd>{step.time || "n/a"}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{formatDuration(step.durationMs)}</dd>
        </div>
        <div>
          <dt>Tokens</dt>
          <dd>{step.tokens ?? "n/a"}</dd>
        </div>
      </dl>
    </aside>
  );
}

function App() {
  const [trace, setTrace] = useState(emptyTrace);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [importDiagnostics, setImportDiagnostics] = useState([]);
  const [importCandidates, setImportCandidates] = useState([]);
  const [comparisonTrace, setComparisonTrace] = useState(null);

  const counts = useMemo(() => {
    const next = { all: trace.steps.length, prompt: 0, reasoning: 0, tool: 0, diff: 0 };
    trace.steps.forEach((step) => {
      next[step.type] = (next[step.type] || 0) + 1;
    });
    return next;
  }, [trace.steps]);

  const laneSteps = useMemo(() => {
    if (filter === "all") return trace.steps;
    return trace.steps.filter((step) => step.type === filter);
  }, [filter, trace.steps]);

  const filteredSteps = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return laneSteps;
    return laneSteps.filter((step) => {
      const haystack = [
        step.title,
        step.content,
        step.tool,
        step.input,
        step.output,
        ...(step.files || []).map((file) => file.path),
      ]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [laneSteps, search]);

  const selectedIndex = filteredSteps.findIndex((step) => step.id === selected?.id);
  const selectedPosition = selectedIndex >= 0 ? selectedIndex + 1 : 0;
  const canPrev = selectedIndex > 0;
  const canNext = selectedIndex >= 0 && selectedIndex < filteredSteps.length - 1;

  const toolCalls = counts.tool || 0;
  const failures = trace.steps.filter((step) => step.status === "failed").length;
  const changedFiles = trace.steps.reduce((sum, step) => sum + (step.files?.length ?? 0), 0);
  const tokenTotal = Number(trace.tokens?.total || 0);
  const cost = Number(trace.costUsd || 0);
  const sanitizedPreview = useMemo(() => sanitizeTraceForSharing(trace), [trace]);

  function selectRelative(delta) {
    if (!filteredSteps.length) return;
    const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const nextIndex = Math.max(0, Math.min(filteredSteps.length - 1, currentIndex + delta));
    setSelected(filteredSteps[nextIndex]);
  }

  function selectIndex(index) {
    if (!filteredSteps.length) return;
    const nextIndex = Math.max(0, Math.min(filteredSteps.length - 1, index));
    setSelected(filteredSteps[nextIndex]);
  }

  function handleFilterChange(nextFilter) {
    const nextSteps = nextFilter === "all" ? trace.steps : trace.steps.filter((step) => step.type === nextFilter);
    setFilter(nextFilter);
    setSearch("");
    setSelected(nextSteps[0] || null);
  }

  useEffect(() => {
    function handleKeyDown(event) {
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") return;

      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        selectRelative(-1);
      }

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        selectRelative(1);
      }

      if (event.key === "Home") {
        event.preventDefault();
        selectIndex(0);
      }

      if (event.key === "End") {
        event.preventDefault();
        selectIndex(filteredSteps.length - 1);
      }

      const shortcut = event.key.toLowerCase();
      if (shortcut === "p") handleFilterChange("prompt");
      if (shortcut === "a") handleFilterChange("all");
      if (shortcut === "t") handleFilterChange("tool");
      if (shortcut === "r") handleFilterChange("reasoning");
      if (shortcut === "d") handleFilterChange("diff");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredSteps, selectedIndex]);

  useEffect(() => {
    const active = document.querySelector('.timeline-item[data-active="true"]');
    active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected?.id, filter]);

  useEffect(() => {
    if (!filteredSteps.length) {
      setSelected(null);
      return;
    }
    if (!filteredSteps.some((step) => step.id === selected?.id)) {
      setSelected(filteredSteps[0]);
    }
  }, [filteredSteps, selected?.id]);

  async function loadTrace(nextTrace, message) {
    if (!Array.isArray(nextTrace.steps)) throw new Error("Trace must include a steps array.");
    setTrace(nextTrace);
    setSelected(nextTrace.steps[0] || null);
    setFilter("all");
    setSearch("");
    setImportStatus(message);
  }

  async function handleTraceUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const diagnostics = [];
    setImportStatus(`Loading ${file.name}...`);
    try {
      const nextTrace = await importTraceFile(file, diagnostics);
      addImportDiagnostic(diagnostics, "success", file.name, `Loaded ${nextTrace.steps.length} events`);
      setImportDiagnostics(diagnostics);
      setImportCandidates([]);
      await loadTrace(nextTrace, `Loaded ${file.name} (${nextTrace.steps.length} events)`);
    } catch (error) {
      addImportDiagnostic(diagnostics, "error", file.name, error.message);
      setImportDiagnostics(diagnostics);
      setImportStatus(`Failed to load ${file.name}: ${error.message}`);
      alert(`Could not load trace: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  }

  async function handleFolderUpload(event) {
    const files = Array.from(event.target.files || []).filter(isCandidateFile);
    const diagnostics = [];
    setImportStatus(`Scanning folder... ${event.target.files?.length || 0} files selected`);
    if (!files.length) {
      addImportDiagnostic(diagnostics, "warning", "Folder scan", "No candidate JSON, JSONL, or log files matched importer path hints.");
      setImportDiagnostics(diagnostics);
      setImportStatus("No supported Codex / Claude Code JSONL files found in that folder.");
      event.target.value = "";
      return;
    }

    const candidates = [];
    if (files.length > 300) {
      addImportDiagnostic(diagnostics, "warning", "Folder scan", `Only the first 300 of ${files.length} candidate files were scanned.`);
    }

    for (const file of files.slice(0, 300)) {
      const path = file.webkitRelativePath || file.name;
      try {
        setImportStatus(`Scanning ${path}...`);
        const traceCandidate = await importTraceFile(file, diagnostics);
        if (traceCandidate.steps?.length) {
          candidates.push({ file, trace: traceCandidate });
          addImportDiagnostic(diagnostics, "success", path, `Detected ${traceCandidate.agent || "agent"} trace with ${traceCandidate.steps.length} events.`);
        }
      } catch (error) {
        addImportDiagnostic(diagnostics, "skipped", path, error.message);
        // Skip files that are JSON but not agent records.
      }
    }
    setImportDiagnostics(diagnostics);

    if (!candidates.length) {
      setImportStatus(`Scanned ${files.length} files, but no supported agent trace was detected.`);
      event.target.value = "";
      return;
    }

    candidates.sort((a, b) => {
      const modifiedDelta = (b.file.lastModified || 0) - (a.file.lastModified || 0);
      if (modifiedDelta) return modifiedDelta;
      return b.trace.steps.length - a.trace.steps.length;
    });

    const summarized = candidates.map(describeImportCandidate);
    if (summarized.length > 1) {
      setImportCandidates(summarized);
      setImportStatus(`Scanned ${files.length} files and found ${summarized.length} trace(s). Choose one to load.`);
      event.target.value = "";
      return;
    }

    const best = summarized[0];
    setImportCandidates([]);
    await loadTrace(best.trace, `Scanned ${files.length} files, loaded ${best.path}`);
    event.target.value = "";
  }

  async function handleCompareUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const diagnostics = [];
    try {
      const nextTrace = await importTraceFile(file, diagnostics);
      setComparisonTrace(nextTrace);
      setImportStatus(`Comparing against ${file.name} (${nextTrace.steps.length} events)`);
    } catch (error) {
      setImportStatus(`Failed to compare ${file.name}: ${error.message}`);
      alert(`Could not load comparison trace: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  }

  async function handleCandidateSelect(candidate) {
    setImportCandidates([]);
    const diagnostics = [...importDiagnostics];
    addImportDiagnostic(diagnostics, "success", candidate.path, `Loaded selected trace with ${candidate.events} events.`);
    setImportDiagnostics(diagnostics);
    await loadTrace(candidate.trace, `Loaded ${candidate.path} (${candidate.events} events)`);
  }

  function downloadReport() {
    const payload = JSON.stringify(trace, null, 2);
    downloadBlob(payload, `${safeDownloadName(trace.runId)}-trace.json`, "application/json");
  }

  function downloadSanitizedReport() {
    const { trace: sanitized, stats } = sanitizeTraceForSharing(trace);
    downloadBlob(JSON.stringify(sanitized, null, 2), `${safeDownloadName(sanitized.runId)}-sanitized-trace.json`, "application/json");
    setImportStatus(`Sanitized export created (${stats.secrets} secrets, ${stats.paths} paths redacted).`);
  }

  function downloadHtmlReport() {
    const { trace: sanitized, stats } = sanitizeTraceForSharing(trace);
    const html = buildStaticHtmlReport(sanitized, stats);
    downloadBlob(html, `${safeDownloadName(sanitized.runId)}-static-report.html`, "text/html");
    setImportStatus(`Static HTML report created (${stats.secrets} secrets, ${stats.paths} paths redacted).`);
  }

  return (
    <div className="app-shell">
      <TopBar
        trace={trace}
        onUpload={handleTraceUpload}
        onFolderUpload={handleFolderUpload}
        onCompareUpload={handleCompareUpload}
        onExport={downloadReport}
        onSanitizedExport={downloadSanitizedReport}
        onHtmlReport={downloadHtmlReport}
        importStatus={importStatus}
      />

      <div className="workspace-grid">
        <FilterRail
          filter={filter}
          onFilterChange={handleFilterChange}
          counts={counts}
          diagnostics={importDiagnostics}
          privacyStats={sanitizedPreview.stats}
        />

        <main className="detail-stage">
          <HeroPanel trace={trace} failures={failures} />
          <section className="metrics-grid">
            <MetricCard label="Tool Calls" value={toolCalls} hint="MCP + shell activity" tone="blue" />
            <MetricCard label="Changed Files" value={changedFiles} hint="Diffs captured" tone="orange" />
            <MetricCard label="Tokens" value={tokenTotal.toLocaleString()} hint="Prompt + output" tone="green" />
            <MetricCard label="Cost" value={`$${cost.toFixed(2)}`} hint="Estimated run spend" tone="ink" />
          </section>
          <TraceComparisonPanel trace={trace} comparisonTrace={comparisonTrace} onClear={() => setComparisonTrace(null)} />
          <StepDetails
            step={selected}
            position={selectedPosition}
            total={filteredSteps.length}
            canPrev={canPrev}
            canNext={canNext}
            onPrev={() => selectRelative(-1)}
            onNext={() => selectRelative(1)}
          />
        </main>

        <aside className="timeline-stage">
          <ReviewToolbar
            steps={filteredSteps}
            selected={selected}
            position={selectedPosition}
            filter={filter}
            search={search}
            onSearch={setSearch}
            onJump={(id) => setSelected(filteredSteps.find((step) => step.id === id) || null)}
            onFirst={() => selectIndex(0)}
            onPrev={() => selectRelative(-1)}
            onNext={() => selectRelative(1)}
            onLast={() => selectIndex(filteredSteps.length - 1)}
            canPrev={canPrev}
            canNext={canNext}
          />
          <Timeline steps={filteredSteps} activeId={selected?.id} onSelect={setSelected} traceStartedAt={trace.startedAt} />
        </aside>
      </div>
      <ImportPicker
        candidates={importCandidates}
        onSelect={handleCandidateSelect}
        onCancel={() => {
          setImportCandidates([]);
          setImportStatus("Trace selection canceled.");
        }}
      />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
