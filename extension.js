// @ts-check
const vscode = require("vscode");
const path = require("path");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const provider = new UmbracoLogEditorProvider(context);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      UmbracoLogEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("umbracoLogViewer.open", (uri) => {
      const target =
        uri ||
        (vscode.window.activeTextEditor &&
          vscode.window.activeTextEditor.document.uri);
      if (!target) {
        vscode.window.showInformationMessage(
          "Open a log file first, then run this command."
        );
        return;
      }
      vscode.commands.executeCommand(
        "vscode.openWith",
        target,
        UmbracoLogEditorProvider.viewType
      );
    })
  );
}

function deactivate() {}

class UmbracoLogEditorProvider {
  static viewType = "umbracoLogViewer.editor";

  /** @param {vscode.ExtensionContext} context */
  constructor(context) {
    this.context = context;
  }

  /**
   * @param {vscode.TextDocument} document
   * @param {vscode.WebviewPanel} webviewPanel
   */
  async resolveCustomTextEditor(document, webviewPanel) {
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
      ],
    };
    webview.html = this.getHtml(webview);

    const post = () => {
      const parsed = parseClef(document.getText());
      webview.postMessage({
        type: "load",
        fileName: path.basename(document.uri.fsPath),
        events: parsed.events,
        parseErrors: parsed.errors,
      });
    };

    // Live-update the view whenever the underlying file changes on disk / in editor.
    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        post();
      }
    });
    webviewPanel.onDidDispose(() => changeSub.dispose());

    webview.onDidReceiveMessage((msg) => {
      switch (msg && msg.type) {
        case "ready":
          post();
          break;
        case "openRaw":
          vscode.commands.executeCommand(
            "vscode.openWith",
            document.uri,
            "default"
          );
          break;
        case "copy":
          vscode.env.clipboard.writeText(String(msg.text || ""));
          break;
      }
    });
  }

  /** @param {vscode.Webview} webview */
  getHtml(webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "viewer.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "viewer.css")
    );
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource}`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Umbraco Log Viewer</title>
</head>
<body>
  <header class="toolbar">
    <div class="toolbar-row">
      <input id="search" type="text" placeholder="Search messages, properties, exceptions…" spellcheck="false" />
      <button id="clearSearch" class="ghost" title="Clear search" aria-label="Clear search">Clear</button>
      <span class="spacer"></span>
      <label class="follow"><input type="checkbox" id="follow" /> Follow tail</label>
      <button id="openRaw" class="ghost" title="Open the raw file as text">Raw</button>
    </div>
    <div class="toolbar-row" id="levels"></div>
  </header>
  <main id="list" tabindex="0"></main>
  <footer id="status" class="status"></footer>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

// ---------------------------------------------------------------------------
// CLEF parsing (newline-delimited JSON produced by Serilog.Formatting.Compact)
// ---------------------------------------------------------------------------

const RESERVED = new Set([
  "@t",
  "@m",
  "@mt",
  "@l",
  "@x",
  "@i",
  "@r",
  "@tr",
  "@sp",
  "@ps",
  "@ft",
]);

/** @param {string} text */
function parseClef(text) {
  const events = [];
  const errors = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    try {
      const obj = JSON.parse(raw);
      events.push(normalizeEvent(obj, i + 1));
    } catch (e) {
      errors.push({ line: i + 1, text: raw.slice(0, 400) });
    }
  }
  return { events, errors };
}

function normalizeEvent(o, lineNumber) {
  const properties = {};
  for (const key of Object.keys(o)) {
    if (RESERVED.has(key)) continue;
    // A user property literally named "@name" is escaped as "@@name" in CLEF.
    const name = key.startsWith("@@") ? key.slice(1) : key;
    properties[name] = o[key];
  }
  return {
    line: lineNumber,
    t: o["@t"] || null,
    level: normalizeLevel(o["@l"]),
    template: typeof o["@mt"] === "string" ? o["@mt"] : "",
    rendered: typeof o["@m"] === "string" ? o["@m"] : null,
    exception: typeof o["@x"] === "string" ? o["@x"] : null,
    eventId: o["@i"] != null ? o["@i"] : null,
    traceId: o["@tr"] || null,
    spanId: o["@sp"] || null,
    properties,
  };
}

// When @l is absent, the level is Information (per the CLEF spec).
function normalizeLevel(level) {
  if (!level) return "Information";
  const l = String(level).toLowerCase();
  if (l.startsWith("verb")) return "Verbose";
  if (l.startsWith("debug")) return "Debug";
  if (l.startsWith("info")) return "Information";
  if (l.startsWith("warn")) return "Warning";
  if (l.startsWith("err")) return "Error";
  if (l.startsWith("fatal") || l.startsWith("crit")) return "Fatal";
  return String(level);
}

function getNonce() {
  let text = "";
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

module.exports = { activate, deactivate };
