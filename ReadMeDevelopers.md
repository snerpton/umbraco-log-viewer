# Umbraco Log Viewer: Developer Help

## Run it (development)

1. Open this folder in VS Code.
2. Press <kbd>F5</kbd> to launch an **Extension Development Host** window.
3. In that window, open `samples/UmbracoTraceLog.DEMO.20260812.json` (or any of
   your own Umbraco log files, usually under `umbraco/Logs/`).

No build step and no `npm install` are required — the extension is plain
JavaScript. I've been building with `v26.7.0`.

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