# Umbraco Log Viewer

A VS Code extension that turns `UmbracoTraceLog.*.json` files into a readable,
searchable log. Those files are **CLEF** (Compact Log Event Format) — one JSON
object per line, written by `Serilog.Formatting.Compact` — so a normal JSON
viewer can't parse them. This extension reads them line by line, renders each
Serilog message template with its properties filled in, and adds level
filtering, search, and expandable exceptions.

## Features

- Opens `UmbracoTraceLog*.json` and `*.clef` files automatically in the viewer
  (double-click, or right-click → **Open in Umbraco Log Viewer**).
- Renders message templates: `Document {DocumentName} (id={Id})` →
  `Document Home (id=1062)`.
- Colour-coded levels (Verbose → Fatal) with per-level counts and one-click
  filtering.
- Full-text search across rendered messages, properties, and exceptions.
- Expand any row to see structured properties, the original template, the
  exception stack trace, and the raw event (with **Copy JSON**).
- Live updates as the file grows, plus an optional **Follow tail** mode.
- Skips unparseable lines gracefully and reports the count.

## Run it (development)

1. Open this folder in VS Code.
2. Press <kbd>F5</kbd> to launch an **Extension Development Host** window.
3. In that window, open `samples/UmbracoTraceLog.DEMO.20260812.json` (or any of
   your own Umbraco log files, usually under `umbraco/Logs/`).

No build step and no `npm install` are required — the extension is plain
JavaScript.

## Install it permanently

Package it into a `.vsix` and install:

```bash
npm install -g @vscode/vsce
vsce package
code --install-extension umbraco-log-viewer-0.1.0.vsix
```

## Publish to the Marketplace (automated)

For hands-off releases, this repo includes a GitHub Actions workflow
(`.github/workflows/release.yml`) that publishes on every `vX.Y.Z` tag using
Microsoft Entra ID / OIDC — no Personal Access Token to store or rotate. See
**[PUBLISHING.md](PUBLISHING.md)** for the one-time setup, then just
`git tag v0.1.0 && git push origin v0.1.0`.

Before publishing, replace the placeholder `publisher` (`your-publisher-id`) and
the `repository` / `bugs` URLs (`your-username`) in `package.json` with your real
Marketplace publisher id and GitHub repo. The bundled `media/icon.png` is used as
the Marketplace icon.

## How it maps CLEF fields

| CLEF field | Meaning              |
| ---------- | -------------------- |
| `@t`       | Timestamp            |
| `@l`       | Level (absent = Information) |
| `@mt`      | Message template     |
| `@m`       | Rendered message (used if present) |
| `@x`       | Exception            |
| `@i`       | Event id             |
| `@tr`/`@sp`| Trace / span id      |
| anything else | Structured property |

## Notes

- For very large files the list draws the most recent 3,000 matching events at a
  time; narrow with filters or search to see older ones.
- If you'd rather see the raw text, click **Raw** in the toolbar (or right-click
  the tab → **Reopen Editor With… → Text Editor**).

## License

MIT
