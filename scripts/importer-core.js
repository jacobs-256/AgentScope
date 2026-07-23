const TRACE_VERSION = "1.0";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstPresent(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "");
}

function getPayload(record) {
  return isPlainObject(record?.payload) ? record.payload : {};
}

function getEventTimestamp(record) {
  const payload = getPayload(record);
  const item = isPlainObject(payload.item) ? payload.item : {};
  return firstPresent(record?.timestamp, record?.created_at, record?.createdAt, record?.ts, payload.timestamp, item.timestamp);
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

function parseJsonLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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
    source: { ...source, recordCount: records?.length || 0 },
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
  const meta = { runId: sourceName.replace(/\W+/g, "_"), agent: "Codex", model: "", title: "", threadId: "", sessionId: "" };
  records.forEach((event) => {
    const payload = getPayload(event);
    const item = getCodexItem(event);
    const source = { ...event, ...payload, ...item };
    const type = getCodexEventType(event);
    if (type === "session_meta" || type === "session_config" || type === "turn_context" || event.type === "session_meta") {
      meta.agent = firstPresent(source.originator, source.agent, meta.agent);
      meta.model = firstPresent(source.model, source.model_slug, meta.model);
      meta.threadId = firstPresent(source.thread_id, source.threadId, source.conversation_id, meta.threadId);
      meta.sessionId = firstPresent(source.session_id, source.sessionId, source.id, meta.sessionId);
      meta.title = firstPresent(source.title, source.name, meta.title);
    }
  });
  meta.runId = firstPresent(meta.threadId, meta.sessionId, meta.runId);
  if (/codex/i.test(meta.agent) && !/cli/i.test(meta.agent)) meta.agent = "Codex CLI";
  return meta;
}

function convertCodexRecords(records, sourceName) {
  const steps = [];
  const calls = new Map();
  const meta = extractCodexMetadata(records, sourceName);
  let stepId = 1;
  let tokens = { input: 0, output: 0, total: 0 };

  records.forEach((event) => {
    const timestamp = getEventTimestamp(event);
    const payload = getCodexItem(event);
    const type = getCodexEventType(event);
    const role = payload.role;
    if (type === "user_message" || (type === "message" && role === "user")) {
      steps.push(makeStep(stepId++, "prompt", "User Request", timestamp, "ok", payload.message || payload.content || payload.text));
    } else if (type === "agent_message" || type === "agent_reasoning" || type === "reasoning" || (type === "message" && role === "assistant")) {
      steps.push(makeStep(stepId++, "reasoning", type === "agent_message" || type === "message" ? "Agent Message" : "Agent Reasoning", timestamp, "ok", payload.message || payload.text || payload.summary || payload.content || payload.output_text));
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
      const step = calls.get(payload.call_id || payload.id);
      const output = contentToText(payload.output || payload.query || payload);
      if (step) {
        step.output = output;
        step.durationMs = durationBetween(step._startedAt, timestamp);
        if (outputLooksFailed(output)) step.status = "failed";
      }
    } else if (type === "patch_apply_end") {
      const files = Object.entries(payload.changes || {}).map(([filePath, change]) => ({
        path: filePath,
        adds: String(change?.content || "").split(/\r?\n/).filter(Boolean).length,
        deletes: String(change?.previous_content || change?.old_content || "").split(/\r?\n/).filter(Boolean).length,
      }));
      steps.push(makeStep(stepId++, "diff", payload.success === false ? "Patch Failed" : "Patch Applied", timestamp, payload.success === false ? "failed" : "ok", payload.stdout || payload.stderr || "", { files }));
    }
    tokens = extractTokenUsage(event) || extractTokenUsage(payload) || tokens;
  });
  steps.forEach((step) => delete step._startedAt);
  const trace = buildTrace({
    runId: meta.runId,
    agent: meta.agent,
    model: meta.model || "codex",
    summary: meta.title || `Codex trace imported from ${sourceName}`,
    source: { kind: "codex_rollout", path: sourceName, threadId: meta.threadId, sessionId: meta.sessionId },
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

  function pairToolResult(block, timestamp) {
    const toolUseId = block?.tool_use_id || block?.id;
    const output = contentToText(firstPresent(block?.content, block?.result, block?.output, block));
    const step = toolSteps.get(toolUseId);
    if (step) {
      step.output = output;
      step.durationMs = durationBetween(step._startedAt, timestamp);
      if (block?.is_error || outputLooksFailed(output)) step.status = "failed";
    }
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
      return;
    }
    if (role === "assistant") {
      const text = blocks.filter((block) => typeof block === "string" || block?.text).map(contentToText).join("\n");
      if (text) steps.push(makeStep(stepId++, "reasoning", "Assistant Message", timestamp, "ok", text));
      blocks.filter((block) => block?.type === "tool_use").forEach((block) => {
        const step = makeStep(stepId++, "tool", `Tool Call: ${block.name || "Claude Tool"}`, timestamp, "ok", "", {
          tool: block.name || "claude.tool",
          input: contentToText(block.input || ""),
          output: "",
          _startedAt: timestamp,
        });
        if (block.id) toolSteps.set(block.id, step);
        steps.push(step);
      });
    } else if (role === "user") {
      steps.push(makeStep(stepId++, "prompt", "User Prompt", timestamp, "ok", content));
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
      const timestamp = getEventTimestamp(record);
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

function normalizeTrace(trace) {
  return { ...trace, traceVersion: trace.traceVersion || TRACE_VERSION };
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

function importTraceText(text, sourceName) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("File is empty.");
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed);
      if (Array.isArray(json.steps)) return normalizeTrace(json);
      return detectAndConvert([json], sourceName);
    } catch {
      return detectAndConvert(parseJsonLines(trimmed), sourceName);
    }
  }
  if (trimmed.startsWith("[")) {
    const json = JSON.parse(trimmed);
    if (Array.isArray(json) && json[0]?.steps) return normalizeTrace(json[0]);
    if (Array.isArray(json)) return detectAndConvert(json, sourceName);
  }
  return detectAndConvert(parseJsonLines(trimmed), sourceName);
}

module.exports = {
  TRACE_VERSION,
  importTraceText,
  detectAndConvert,
};
