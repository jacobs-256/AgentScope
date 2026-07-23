# Security Policy

> Language: English | [中文简体](./docs/zh-CN/04-community/security.md)

## Supported versions

AgentScope is currently pre-1.0. Security fixes will target the latest version on the default branch.

## Reporting a vulnerability

Please do not open a public issue for vulnerabilities involving secret exposure, unsafe trace rendering, local file access, or importer behavior.

Report privately to the maintainers of the repository. If no private channel is configured yet, open a minimal public issue asking for a private contact method and do not include sensitive details.

## Sensitive trace data

Agent traces can contain:

- API keys, access tokens, and environment variables
- Private prompts and instructions
- Source code and file paths
- Command output and stack traces
- Customer or company data

Review and sanitize traces before sharing them.

## Local-first design

AgentScope is designed to run locally in the browser. The current MVP does not require a hosted backend. Browser folder scanning still requires explicit user selection because web apps cannot silently read local folders.

## Known security considerations

- Markdown is sanitized before preview rendering.
- JSON and code are rendered as text or sanitized highlighted HTML.
- Importers should treat all trace content as untrusted input.
- Redaction is not complete yet; do not rely on AgentScope to remove all secrets automatically.
