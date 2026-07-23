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

- Use **Sanitized JSON** or **HTML Report** before sharing outside your local machine.
- Search the exported file for `key`, `token`, `secret`, `password`, `Authorization`, `sk-`, and `.env`.
- Confirm private file paths were replaced with placeholders.
- Remove customer names, internal URLs, and proprietary snippets that automatic rules cannot identify.
- Prefer the smallest trace sample that reproduces the issue.
- Use synthetic traces for public examples whenever possible.

## Built-in redaction

AgentScope redacts common sensitive values during sanitized export and static HTML report generation.

Secret-like values include:

- OpenAI-style `sk-` API keys
- GitHub token prefixes such as `ghp_`, `gho_`, `ghu_`, `ghs_`, and `ghr_`
- AWS access key IDs
- JWT-like tokens
- `Authorization: Bearer ...` and `Authorization: Basic ...`
- Assignments whose names include `api_key`, `token`, `secret`, `password`, `passwd`, or `pwd`
- PEM private key blocks

Path-like values include:

- Windows drive paths such as `C:\Users\name\project\file.ts`
- Windows user paths such as `\Users\name\project\file.ts`
- POSIX user paths such as `/Users/name/project/file.ts` and `/home/name/project/file.ts`
- Tilde paths such as `~/project/file.ts`
- `file://` URLs

For path fields such as `source.path`, `source.cwd`, and changed file paths, AgentScope replaces directory information with `[REDACTED_PATH]` while preserving the final file name when possible. Upstream `threadId` and `sessionId` values are replaced with `[REDACTED]` in sanitized exports.

## Sharing options

- **Export JSON** downloads the currently loaded trace without redaction. Use this only for trusted local review.
- **Sanitized JSON** downloads a redacted AgentScope trace with a `sharing` metadata block that records redaction counts and rule hits.
- **HTML Report** downloads a single-file static report. It contains sanitized event content and inline styles only, with no backend, account, telemetry, or external asset dependency.

## Current limitations

Automatic redaction is best-effort. It may miss proprietary identifiers, customer data, internal URLs, unusual secret formats, or sensitive relative paths. Always review sanitized exports manually before public sharing.
