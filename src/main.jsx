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

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);

const emptyTrace = {
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
const candidatePathHints = ["rollout", "session", "transcript", "claude", "codex", "conversation"];

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

function parseJsonLines(text) {
  const records = [];
  const errors = [];

  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      try {
        records.push(JSON.parse(line));
      } catch (error) {
        errors.push(`line ${index + 1}: ${error.message}`);
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

function buildTrace({ runId, agent, model, summary, source, records, steps }) {
  const first = records?.[0]?.timestamp || records?.[0]?.ts || records?.[0]?.created_at;
  const last = records?.at(-1)?.timestamp || records?.at(-1)?.ts || records?.at(-1)?.created_at;
  const failedCount = steps.filter((step) => step.status === "failed").length;
  const diffCount = steps.filter((step) => step.type === "diff").length;
  const toolCount = steps.filter((step) => step.type === "tool").length;

  return {
    runId,
    agent,
    model: model || "unknown",
    status: failedCount ? "failed" : "ok",
    startedAt: first || new Date().toISOString(),
    durationMs: durationBetween(first, last),
    tokens: { input: 0, output: 0, total: 0 },
    costUsd: 0,
    riskScore: Math.min(100, failedCount * 28 + diffCount * 9 + toolCount * 3),
    summary,
    source,
    steps,
  };
}

function convertCodexRecords(records, sourceName) {
  const steps = [];
  const calls = new Map();
  let stepId = 1;
  let tokens = { input: 0, output: 0, total: 0 };

  records.forEach((event) => {
    const timestamp = event.timestamp;
    const payload = event.payload || {};
    const type = payload.type;

    if (type === "user_message") {
      steps.push(makeStep(stepId++, "prompt", "User Request", timestamp, "ok", payload.message));
    } else if (type === "agent_message" || type === "agent_reasoning" || type === "reasoning") {
      steps.push(makeStep(stepId++, "reasoning", type === "agent_message" ? "Agent Message" : "Agent Reasoning", timestamp, "ok", payload.message || payload.text || payload.summary));
    } else if (type === "function_call" || type === "custom_tool_call" || type === "web_search_call") {
      const name = payload.name || payload.action?.type || "tool";
      const callId = payload.call_id || payload.id || `call_${stepId}`;
      const step = makeStep(stepId++, "tool", `Tool Call: ${name}`, timestamp, "ok", "", {
        tool: name,
        input: contentToText(payload.arguments || payload.input || payload.action || ""),
        output: "",
        _startedAt: timestamp,
      });
      calls.set(callId, step);
      steps.push(step);
    } else if (type === "function_call_output" || type === "custom_tool_call_output" || type === "web_search_end") {
      const callId = payload.call_id || payload.id;
      const step = calls.get(callId);
      const output = contentToText(payload.output || payload.query || payload);
      if (step) {
        step.output = output;
        step.durationMs = durationBetween(step._startedAt, timestamp);
        if (/error|failed|exit code:\s*[1-9]/i.test(output)) step.status = "failed";
      }
    } else if (type === "patch_apply_end") {
      const files = Object.entries(payload.changes || {}).map(([path, change]) => ({
        path,
        adds: String(change?.content || "").split(/\r?\n/).filter(Boolean).length,
        deletes: String(change?.previous_content || change?.old_content || "").split(/\r?\n/).filter(Boolean).length,
      }));
      steps.push(makeStep(stepId++, "diff", payload.success === false ? "Patch Failed" : "Patch Applied", timestamp, payload.success === false ? "failed" : "ok", payload.stdout || payload.stderr || "", { files }));
    } else if (type === "token_count") {
      const usage = payload.info?.total_token_usage || {};
      tokens = {
        input: Number(usage.input_tokens || 0),
        output: Number(usage.output_tokens || 0),
        total: Number(usage.total_tokens || 0),
      };
    }
  });

  steps.forEach((step) => delete step._startedAt);
  const trace = buildTrace({
    runId: sourceName.replace(/\W+/g, "_"),
    agent: "Codex",
    model: "codex",
    summary: `Codex trace imported from ${sourceName}`,
    source: { kind: "codex_rollout", path: sourceName },
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

  records.forEach((record) => {
    const timestamp = record.timestamp || record.created_at || record.ts;
    const role = record.type || record.role || record.message?.role;
    const message = record.message || record;
    const content = message.content || record.content || record.text;

    if (role === "user") {
      steps.push(makeStep(stepId++, "prompt", "User Prompt", timestamp, "ok", content));
      return;
    }

    if (role === "assistant") {
      const blocks = Array.isArray(content) ? content : [content];
      const text = blocks.filter((block) => typeof block === "string" || block?.text).map(contentToText).join("\n");
      if (text) steps.push(makeStep(stepId++, "reasoning", "Assistant Message", timestamp, "ok", text));

      blocks
        .filter((block) => block?.type === "tool_use")
        .forEach((block) => {
          const step = makeStep(stepId++, "tool", `Tool Call: ${block.name || "Claude Tool"}`, timestamp, "ok", "", {
            tool: block.name || "claude.tool",
            input: contentToText(block.input || ""),
            output: "",
          });
          if (block.id) toolSteps.set(block.id, step);
          steps.push(step);
        });
      return;
    }

    if (role === "tool_result" || record.type === "tool_result") {
      const step = toolSteps.get(record.tool_use_id);
      if (step) step.output = contentToText(content || record.result || record);
      else steps.push(makeStep(stepId++, "tool", "Tool Result", timestamp, "ok", content || record.result || record));
    }
  });

  return buildTrace({
    runId: sourceName.replace(/\W+/g, "_"),
    agent: "Claude Code",
    model: "claude",
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
  if (records[0]?.steps && Array.isArray(records[0].steps)) return records[0];
  if (records.some((record) => record.payload?.type === "user_message" || record.payload?.type === "function_call")) {
    return convertCodexRecords(records, sourceName);
  }
  if (records.some((record) => record.message?.role || record.type === "assistant" || record.type === "user")) {
    return convertClaudeRecords(records, sourceName);
  }
  return convertGenericRecords(records, sourceName);
}

async function importTraceFile(file) {
  const text = await file.text();
  const sourceName = file.webkitRelativePath || file.name;
  const trimmed = text.trim();
  if (!trimmed) throw new Error("File is empty.");

  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed);
      if (Array.isArray(json.steps)) return json;
      return detectAndConvert([json], sourceName);
    } catch {
      const records = parseJsonLines(trimmed);
      return detectAndConvert(records, sourceName);
    }
  }

  if (trimmed.startsWith("[")) {
    const json = JSON.parse(trimmed);
    if (Array.isArray(json) && json[0]?.steps) return json[0];
    if (Array.isArray(json)) return detectAndConvert(json, sourceName);
  }

  const records = parseJsonLines(trimmed);
  return detectAndConvert(records, sourceName);
}

function isCandidateFile(file) {
  const path = (file.webkitRelativePath || file.name).toLowerCase();
  const hasExtension = candidateExtensions.some((extension) => path.endsWith(extension));
  const hasHint = candidatePathHints.some((hint) => path.includes(hint));
  return hasExtension && (hasHint || path.endsWith(".jsonl"));
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

function TopBar({ trace, onUpload, onFolderUpload, onExport, importStatus }) {
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
        <button className="action ghost-action" onClick={onExport}>
          Export JSON
        </button>
      </div>
    </header>
  );
}

function FilterRail({ filter, onFilterChange, counts }) {
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
    setImportStatus(`Loading ${file.name}...`);
    try {
      const nextTrace = await importTraceFile(file);
      await loadTrace(nextTrace, `Loaded ${file.name} (${nextTrace.steps.length} events)`);
    } catch (error) {
      setImportStatus(`Failed to load ${file.name}: ${error.message}`);
      alert(`Could not load trace: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  }

  async function handleFolderUpload(event) {
    const files = Array.from(event.target.files || []).filter(isCandidateFile);
    setImportStatus(`Scanning folder... ${event.target.files?.length || 0} files selected`);
    if (!files.length) {
      setImportStatus("No supported Codex / Claude Code JSONL files found in that folder.");
      event.target.value = "";
      return;
    }

    const candidates = [];
    for (const file of files.slice(0, 300)) {
      try {
        setImportStatus(`Scanning ${file.webkitRelativePath || file.name}...`);
        const traceCandidate = await importTraceFile(file);
        if (traceCandidate.steps?.length) {
          candidates.push({ file, trace: traceCandidate });
        }
      } catch {
        // Skip files that are JSON but not agent records.
      }
    }

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

    const best = candidates[0];
    await loadTrace(
      best.trace,
      `Scanned ${files.length} files, found ${candidates.length} trace(s), loaded ${best.file.webkitRelativePath || best.file.name}`,
    );
    event.target.value = "";
  }

  function downloadReport() {
    const payload = JSON.stringify(trace, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${trace.runId || "agentscope"}-trace.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <TopBar
        trace={trace}
        onUpload={handleTraceUpload}
        onFolderUpload={handleFolderUpload}
        onExport={downloadReport}
        importStatus={importStatus}
      />

      <div className="workspace-grid">
        <FilterRail filter={filter} onFilterChange={handleFilterChange} counts={counts} />

        <main className="detail-stage">
          <HeroPanel trace={trace} failures={failures} />
          <section className="metrics-grid">
            <MetricCard label="Tool Calls" value={toolCalls} hint="MCP + shell activity" tone="blue" />
            <MetricCard label="Changed Files" value={changedFiles} hint="Diffs captured" tone="orange" />
            <MetricCard label="Tokens" value={tokenTotal.toLocaleString()} hint="Prompt + output" tone="green" />
            <MetricCard label="Cost" value={`$${cost.toFixed(2)}`} hint="Estimated run spend" tone="ink" />
          </section>
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
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
