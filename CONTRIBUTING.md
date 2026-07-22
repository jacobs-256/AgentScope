# Contributing to AgentScope

Thanks for your interest in AgentScope. The project is early, so clear bug reports, importer samples, UI feedback, and focused pull requests are especially valuable.

## Ways to contribute

- Report import failures for Codex, Claude Code, or other AI tools.
- Add or improve trace importers.
- Improve the trace viewer UI and review workflow.
- Add privacy and redaction features.
- Improve documentation and examples.

## Local setup

```bash
npm install
npm run dev
```

Run a production build before opening a pull request:

```bash
npm run build
```

## Pull request guidelines

- Keep changes focused and easy to review.
- Include screenshots or short screen recordings for UI changes.
- Avoid committing private trace data.
- Add sample traces only if they are synthetic or fully sanitized.
- Update documentation when behavior changes.

## Trace samples

Trace files often contain private prompts, file paths, command output, and code. Before sharing a trace in an issue or pull request:

- Remove secrets and tokens.
- Remove customer or company data.
- Replace private file paths with placeholders.
- Keep the smallest sample that reproduces the issue.

## Commit style

Use short, descriptive commit messages. Examples:

```text
fix: parse Codex JSONL after JSON fallback
feat: add Claude Code transcript importer
docs: document trace schema
```

## Code of conduct

By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
