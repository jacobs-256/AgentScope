#!/usr/bin/env python3
"""Convert local Codex rollout JSONL files into AgentScope trace JSON."""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CODEX_HOME = Path.home() / ".codex"
STATE_DB = CODEX_HOME / "state_5.sqlite"
SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{12,}"),
    re.compile(r"(api[_-]?key|token|secret|password)([\"'\s:=]+)([^\"'\s,;]+)", re.I),
]


def redact(value: Any, limit: int = 2400) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    for pattern in SECRET_PATTERNS:
        text = pattern.sub(lambda m: f"{m.group(1) if m.lastindex and m.lastindex >= 1 else 'secret'}[REDACTED]", text)
    if len(text) > limit:
        return text[:limit] + "\n...[truncated]"
    return text


def parse_ts(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def display_time(raw: str | None) -> str:
    parsed = parse_ts(raw)
    if not parsed:
        return ""
    return parsed.strftime("%H:%M:%S")


def duration_ms(start: str | None, end: str | None) -> int:
    start_dt = parse_ts(start)
    end_dt = parse_ts(end)
    if not start_dt or not end_dt:
        return 0
    return max(0, int((end_dt - start_dt).total_seconds() * 1000))


def load_threads() -> list[dict[str, Any]]:
    if not STATE_DB.exists():
        return []
    con = sqlite3.connect(STATE_DB)
    con.row_factory = sqlite3.Row
    try:
        rows = con.execute(
            """
            select id, title, cwd, rollout_path, created_at, updated_at, tokens_used, model
            from threads
            order by updated_at desc
            """
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        con.close()


def find_rollout(args: argparse.Namespace) -> tuple[Path, dict[str, Any]]:
    threads = load_threads()

    if args.rollout:
      return Path(args.rollout).expanduser(), {}

    if args.thread:
        for thread in threads:
            if thread["id"].startswith(args.thread):
                return Path(thread["rollout_path"]), thread
        raise SystemExit(f"No Codex thread matched: {args.thread}")

    if args.latest:
        if not threads:
            raise SystemExit(f"No Codex thread index found at {STATE_DB}")
        return Path(threads[0]["rollout_path"]), threads[0]

    raise SystemExit("Choose one: --latest, --thread <id>, or --rollout <path>")


def list_threads() -> None:
    threads = load_threads()
    if not threads:
        print(f"No Codex threads found at {STATE_DB}")
        return
    for thread in threads[:30]:
        updated = datetime.fromtimestamp(thread["updated_at"], tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        print(f"{thread['id']}  {updated}  {thread['title'][:86]}")


def count_patch_lines(change: dict[str, Any]) -> tuple[int, int]:
    content = change.get("content") or ""
    previous = change.get("previous_content") or change.get("old_content") or ""
    if change.get("type") == "delete":
        return 0, len(content.splitlines())
    if change.get("type") == "add":
        return len(content.splitlines()), 0
    return len(content.splitlines()), len(previous.splitlines())


def new_step(step_id: int, step_type: str, title: str, timestamp: str | None, status: str, content: str) -> dict[str, Any]:
    return {
        "id": f"s{step_id}",
        "type": step_type,
        "title": title,
        "time": display_time(timestamp),
        "durationMs": 0,
        "status": status,
        "content": content,
    }


def convert_rollout(rollout_path: Path, thread: dict[str, Any]) -> dict[str, Any]:
    if not rollout_path.exists():
        raise SystemExit(f"Rollout file not found: {rollout_path}")

    steps: list[dict[str, Any]] = []
    call_index: dict[str, dict[str, Any]] = {}
    started_at: str | None = None
    ended_at: str | None = None
    tokens = {"input": 0, "output": 0, "total": int(thread.get("tokens_used") or 0)}
    agent = "Codex"
    model = thread.get("model") or "unknown"
    step_id = 1

    with rollout_path.open("r", encoding="utf-8") as file:
        for line in file:
            if not line.strip():
                continue
            event = json.loads(line)
            timestamp = event.get("timestamp")
            started_at = started_at or timestamp
            ended_at = timestamp or ended_at
            payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
            event_type = payload.get("type")

            if event.get("type") == "session_meta":
                agent = payload.get("originator") or agent
                model = payload.get("model") or model
                continue

            if event_type == "user_message":
                message = redact(payload.get("message", ""))
                steps.append(new_step(step_id, "prompt", "User Request", timestamp, "ok", message))
                step_id += 1

            elif event_type in {"agent_message", "agent_reasoning", "reasoning"}:
                message = payload.get("message") or payload.get("text") or payload.get("summary") or ""
                if isinstance(message, list):
                    message = " ".join(str(item) for item in message)
                title = "Agent Answer" if event_type == "agent_message" else "Agent Reasoning"
                steps.append(new_step(step_id, "reasoning", title, timestamp, "ok", redact(message)))
                step_id += 1

            elif event_type in {"function_call", "custom_tool_call", "web_search_call"}:
                name = payload.get("name") or payload.get("action", {}).get("type") or "tool"
                call_id = payload.get("call_id") or payload.get("id") or f"call_{step_id}"
                raw_input = payload.get("arguments") or payload.get("input") or payload.get("action") or ""
                step = new_step(step_id, "tool", f"Tool Call: {name}", timestamp, "ok", "")
                step["tool"] = name
                step["input"] = redact(raw_input)
                step["output"] = ""
                step["_startedAt"] = timestamp
                call_index[call_id] = step
                steps.append(step)
                step_id += 1

            elif event_type in {"function_call_output", "custom_tool_call_output", "web_search_end"}:
                call_id = payload.get("call_id") or payload.get("id")
                output = payload.get("output") or payload.get("query") or payload
                step = call_index.get(call_id)
                if step:
                    step["output"] = redact(output)
                    step["durationMs"] = duration_ms(step.get("_startedAt"), timestamp)
                    if "exit code: 1" in step["output"].lower() or "error" in step["output"].lower():
                        step["status"] = "failed"
                else:
                    steps.append(new_step(step_id, "tool", "Tool Output", timestamp, "ok", redact(output)))
                    step_id += 1

            elif event_type == "patch_apply_end":
                success = bool(payload.get("success", payload.get("status") == "completed"))
                step = new_step(
                    step_id,
                    "diff",
                    "Patch Applied" if success else "Patch Failed",
                    timestamp,
                    "ok" if success else "failed",
                    redact(payload.get("stdout") or payload.get("stderr") or ""),
                )
                files = []
                for path, change in (payload.get("changes") or {}).items():
                    adds, deletes = count_patch_lines(change if isinstance(change, dict) else {})
                    files.append({"path": path, "adds": adds, "deletes": deletes})
                step["files"] = files
                steps.append(step)
                step_id += 1

            elif event_type == "token_count":
                usage = (payload.get("info") or {}).get("total_token_usage") or {}
                tokens = {
                    "input": int(usage.get("input_tokens") or 0),
                    "output": int(usage.get("output_tokens") or 0),
                    "total": int(usage.get("total_tokens") or 0),
                }

            elif event_type == "task_complete":
                ended_at = timestamp or ended_at
                if payload.get("duration_ms") and steps:
                    steps[-1]["durationMs"] = steps[-1].get("durationMs") or int(payload["duration_ms"])

    for step in steps:
        step.pop("_startedAt", None)

    failed_count = sum(1 for step in steps if step.get("status") == "failed")
    warning_count = sum(1 for step in steps if step.get("status") == "warning")
    risk_score = min(100, failed_count * 30 + warning_count * 12 + sum(1 for step in steps if step["type"] == "diff") * 8)

    return {
        "runId": thread.get("id") or rollout_path.stem.replace("rollout-", "run_"),
        "agent": agent,
        "model": model,
        "status": "failed" if failed_count else "ok",
        "startedAt": started_at,
        "durationMs": duration_ms(started_at, ended_at),
        "tokens": tokens,
        "costUsd": 0,
        "riskScore": risk_score,
        "summary": thread.get("title") or f"Codex trace exported from {rollout_path.name}",
        "source": {
            "kind": "codex_rollout",
            "path": str(rollout_path),
        },
        "steps": steps,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Export local Codex records to AgentScope trace JSON.")
    parser.add_argument("--list", action="store_true", help="List recent local Codex threads.")
    parser.add_argument("--latest", action="store_true", help="Export the most recently updated Codex thread.")
    parser.add_argument("--thread", help="Export by Codex thread id prefix.")
    parser.add_argument("--rollout", help="Export a specific rollout JSONL path.")
    parser.add_argument("--out", default="agentscope-trace.json", help="Output JSON path.")
    args = parser.parse_args()

    if args.list:
        list_threads()
        return

    rollout_path, thread = find_rollout(args)
    trace = convert_rollout(rollout_path, thread)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(trace, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_path}")
    print(f"Steps: {len(trace['steps'])}, tokens: {trace['tokens']['total']}, risk: {trace['riskScore']}/100")


if __name__ == "__main__":
    main()
