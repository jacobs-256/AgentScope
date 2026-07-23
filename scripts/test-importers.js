#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { TRACE_VERSION, importTraceText } = require("./importer-core.js");

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, "..", "data", "fixtures", name), "utf8");
}

function assertTraceShape(trace, expected) {
  assert.equal(trace.traceVersion, TRACE_VERSION, `${expected.name} should use traceVersion ${TRACE_VERSION}`);
  assert.equal(trace.agent, expected.agent, `${expected.name} agent`);
  assert.equal(trace.source?.kind, expected.kind, `${expected.name} source kind`);
  assert.equal(trace.steps.length, expected.steps, `${expected.name} step count`);
  assert.ok(trace.startedAt, `${expected.name} startedAt`);
  trace.steps.forEach((step, index) => {
    assert.match(step.id, /^s\d+$/, `${expected.name} step ${index + 1} id`);
    assert.ok(["prompt", "reasoning", "tool", "diff"].includes(step.type), `${expected.name} step ${index + 1} type`);
    assert.ok(step.title, `${expected.name} step ${index + 1} title`);
    assert.ok(["ok", "warning", "failed"].includes(step.status), `${expected.name} step ${index + 1} status`);
  });
}

const nativeTrace = importTraceText(readFixture("agentscope-trace.json"), "agentscope-trace.json");
assertTraceShape(nativeTrace, {
  name: "native AgentScope fixture",
  agent: "Fixture Agent",
  kind: "agentscope_trace",
  steps: 2,
});

const codexTrace = importTraceText(readFixture("codex-rollout.jsonl"), "codex-rollout.jsonl");
assertTraceShape(codexTrace, {
  name: "Codex fixture",
  agent: "Codex CLI",
  kind: "codex_rollout",
  steps: 4,
});
assert.equal(codexTrace.runId, "fixture-codex-thread", "Codex fixture should prefer thread id");
assert.equal(codexTrace.tokens.total, 580, "Codex fixture should extract token totals");
assert.ok(codexTrace.steps.some((step) => step.type === "diff" && step.files?.[0]?.path === "src/synthetic.js"), "Codex fixture should capture patch files");

const claudeTrace = importTraceText(readFixture("claude-code.jsonl"), "claude-code.jsonl");
assertTraceShape(claudeTrace, {
  name: "Claude Code fixture",
  agent: "Claude Code",
  kind: "claude_code_jsonl",
  steps: 4,
});
const claudeTool = claudeTrace.steps.find((step) => step.tool === "Bash");
assert.ok(claudeTool, "Claude fixture should capture assistant tool use");
assert.equal(claudeTool.output, "No changes in the synthetic workspace.", "Claude fixture should pair tool_result output");
assert.ok(claudeTool.durationMs > 0, "Claude fixture should record tool duration");

const genericTrace = importTraceText(readFixture("generic-records.jsonl"), "generic-records.jsonl");
assertTraceShape(genericTrace, {
  name: "generic fixture",
  agent: "Generic AI Tool",
  kind: "generic_jsonl",
  steps: 3,
});

console.log("Importer fixture tests passed.");
