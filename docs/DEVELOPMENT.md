# Development Guide

## Requirements

- Node.js
- npm
- Python 3, only for the optional Codex export helper

## Install

```bash
npm install
```

## Run locally

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Preview production build

```bash
npm run preview
```

## Main files

```text
src/main.jsx                  React app, importers, trace viewer
src/styles.css                Application styling
scripts/codex-rollout-to-trace.py
docs/TRACE_FORMAT.md
docs/IMPORTERS.md
```

## UI layout

AgentScope uses a fixed-height desktop-style layout:

- Left column: trace filters
- Center column: run overview, metrics, selected event content
- Right column: review controls and date-grouped event timeline

The page itself does not globally scroll. Only the relevant panels scroll.

## Privacy and sharing development

Sanitized JSON export and static HTML report generation live in `src/main.jsx`.

When changing privacy behavior:

- Keep all redaction local in the browser.
- Do not send trace content to external services.
- Update `docs/PRIVACY.md` when redaction rules change.
- Keep static HTML reports self-contained and dependency-free.
- Escape report content before inserting it into generated HTML.

## Importer development

When adding importer support:

- Keep parsing tolerant.
- Skip unrelated files silently during folder scans.
- Preserve timestamps.
- Keep private data handling in mind.
- Add documentation updates in `docs/IMPORTERS.md`.
- Add or update synthetic fixtures in `data/fixtures/` when importer behavior changes.

## Release checklist

- Run `npm run build`.
- Review generated traces for private data.
- Update `CHANGELOG.md`.
- Update `README.md` if user-facing behavior changed.
