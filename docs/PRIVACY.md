# Privacy Guide

AgentScope is local-first, but trace data can still be sensitive.

## What traces may contain

- User prompts and private instructions
- Source code snippets
- File paths and repository names
- Shell commands and outputs
- API keys, tokens, cookies, and environment variables
- Customer or company data
- Internal model or agent responses

## Before sharing a trace

- Search for `key`, `token`, `secret`, `password`, `Authorization`, `sk-`, and `.env`.
- Replace private file paths with placeholders.
- Remove customer names and internal URLs.
- Prefer the smallest trace sample that reproduces the issue.
- Use synthetic traces for public examples whenever possible.

## Current limitations

AgentScope includes basic safety-oriented rendering, but it does not yet provide complete automatic redaction. Do not rely on the MVP to sanitize traces for public sharing.

## Planned privacy work

- Redaction rules for secrets.
- Redaction rules for local file paths.
- One-click sanitized export.
- Import-time warnings for likely sensitive strings.
