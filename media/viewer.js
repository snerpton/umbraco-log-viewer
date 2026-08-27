// @ts-check
(function () {
  const vscode = acquireVsCodeApi();

  const LEVELS = [
    "Verbose",
    "Debug",
    "Information",
    "Warning",
    "Error",
    "Fatal",
  ];
  const RENDER_CAP = 3000; // Max rows drawn at once to keep the DOM responsive.

  /** @type {any[]} */
  let allEvents = [];
  /** @type {{line:number,text:string}[]} */
  let parseErrors = [];
  const active = new Set(LEVELS); // which levels are shown
  let searchTerm = "";
  let follow = false;

  const els = {
    search: /** @type {HTMLInputElement} */ (byId("search")),
    clearSearch: byId("clearSearch"),
    levels: byId("levels"),
    list: byId("list"),
    status: byId("status"),
    follow: /** @type {HTMLInputElement} */ (byId("follow")),
    openRaw: byId("openRaw"),
    refresh: byId("refresh"),
    poll: /** @type {HTMLInputElement} */ (byId("poll")),
    pollLabel: byId("pollLabel"),
  };

  function byId(id) {
    return /** @type {HTMLElement} */ (document.getElementById(id));
  }

  // --- Message template rendering ------------------------------------------
  // Fills a Serilog template like "Document {Name} (id={Id})" using properties.
  function renderTemplate(template, properties) {
    if (!template) return "";
    let out = "";
    let i = 0;
    while (i < template.length) {
      const c = template[i];
      if (c === "{") {
        if (template[i + 1] === "{") {
          out += "{";
          i += 2;
          continue;
        }
        const end = template.indexOf("}", i);
        if (end === -1) {
          out += template.slice(i);
          break;
        }
        let token = template.slice(i + 1, end);
        if (token[0] === "@" || token[0] === "$") token = token.slice(1);

        let name = token;
        let format = null;
        let align = null;

        const colon = name.indexOf(":");
        if (colon !== -1) {
          format = name.slice(colon + 1);
          name = name.slice(0, colon);
        }
        const comma = name.indexOf(",");
        if (comma !== -1) {
          align = name.slice(comma + 1);
          name = name.slice(0, comma);
        }

        let text;
        if (properties && Object.prototype.hasOwnProperty.call(properties, name)) {
          text = formatValue(properties[name], format);
        } else {
          text = "{" + token + "}"; // property missing — show the token as-is
        }

        const width = align != null ? parseInt(align, 10) : NaN;
        if (!isNaN(width)) {
          text = width < 0 ? text.padEnd(-width) : text.padStart(width);
        }
        out += text;
        i = end + 1;
      } else if (c === "}" && template[i + 1] === "}") {
        out += "}";
        i += 2;
      } else {
        out += c;
        i++;
      }
    }
    return out;
  }

  function formatValue(val, format) {
    if (val === null || val === undefined) return "null";
    if (typeof val === "object") {
      try {
        return JSON.stringify(val);
      } catch (e) {
        return String(val);
      }
    }
    if (typeof val === "number" && format) {
      // Support the common {N:x8} hex format used in CLEF renderings.
      const m = /^x(\d*)$/i.exec(format);
      if (m) {
        let hex = (val >>> 0).toString(16);
        if (m[1]) hex = hex.padStart(parseInt(m[1], 10), "0");
        return hex;
      }
    }
    return String(val);
  }

  function messageOf(ev) {
    if (ev.rendered) return ev.rendered;
    if (ev.template) return renderTemplate(ev.template, ev.properties);
    return "";
  }

  function formatTime(t) {
    if (!t) return "";
    const d = new Date(t);
    if (isNaN(d.getTime())) return t;
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    return (
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      " " +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes()) +
      ":" +
      pad(d.getSeconds()) +
      "." +
      pad(d.getMilliseconds(), 3)
    );
  }

  // --- Filtering ------------------------------------------------------------
  function counts() {
    const c = Object.create(null);
    for (const l of LEVELS) c[l] = 0;
    for (const ev of allEvents) c[ev.level] = (c[ev.level] || 0) + 1;
    return c;
  }

  function matchesSearch(ev) {
    if (!searchTerm) return true;
    const hay = (
      messageOf(ev) +
      " " +
      (ev.exception || "") +
      " " +
      JSON.stringify(ev.properties || {})
    ).toLowerCase();
    return hay.indexOf(searchTerm) !== -1;
  }

  function filtered() {
    return allEvents.filter((ev) => active.has(ev.level) && matchesSearch(ev));
  }

  // --- Rendering ------------------------------------------------------------
  function renderLevels() {
    const c = counts();
    els.levels.innerHTML = "";
    for (const level of LEVELS) {
      const btn = document.createElement("button");
      btn.className =
        "level-chip level-" + level.toLowerCase() + (active.has(level) ? " on" : " off");
      btn.dataset.level = level;
      btn.innerHTML =
        '<span class="dot"></span>' +
        level +
        ' <span class="count">' +
        (c[level] || 0) +
        "</span>";
      btn.addEventListener("click", () => {
        if (active.has(level)) active.delete(level);
        else active.add(level);
        renderLevels();
        renderList();
      });
      els.levels.appendChild(btn);
    }
  }

  function renderList() {
    const rows = filtered();
    const total = rows.length;
    const shown = rows.slice(Math.max(0, total - RENDER_CAP));

    const frag = document.createDocumentFragment();
    for (const ev of shown) frag.appendChild(rowEl(ev));
    els.list.innerHTML = "";
    els.list.appendChild(frag);

    const truncated = total > shown.length;
    let status = total + " of " + allEvents.length + " events";
    if (truncated)
      status += " · showing latest " + shown.length + " (refine to see more)";
    if (parseErrors.length)
      status += " · " + parseErrors.length + " unparseable line(s)";
    els.status.textContent = status;

    if (follow) els.list.scrollTop = els.list.scrollHeight;
  }

  function rowEl(ev) {
    const row = document.createElement("div");
    row.className = "row level-" + ev.level.toLowerCase();

    const head = document.createElement("div");
    head.className = "row-head";

    const hasDetail =
      ev.exception || (ev.properties && Object.keys(ev.properties).length > 0);

    head.innerHTML =
      '<span class="twist">' +
      (hasDetail ? "▶" : "") +
      "</span>" +
      '<span class="time">' +
      escapeHtml(formatTime(ev.t)) +
      "</span>" +
      '<span class="badge level-' +
      ev.level.toLowerCase() +
      '">' +
      ev.level.slice(0, 3).toUpperCase() +
      "</span>" +
      '<span class="msg"></span>';

    head.querySelector(".msg").textContent =
      messageOf(ev) + (ev.exception ? "  ⚠" : "");

    row.appendChild(head);

    if (hasDetail) {
      const detail = document.createElement("div");
      detail.className = "detail hidden";
      detail.appendChild(detailEl(ev));
      row.appendChild(detail);

      head.addEventListener("click", () => {
        const open = detail.classList.toggle("hidden") === false;
        head.querySelector(".twist").textContent = open ? "▼" : "▶";
      });
    }
    return row;
  }

  function detailEl(ev) {
    const wrap = document.createElement("div");

    const props = ev.properties || {};
    const keys = Object.keys(props);
    if (keys.length) {
      const table = document.createElement("table");
      table.className = "props";
      for (const k of keys) {
        const tr = document.createElement("tr");
        const td1 = document.createElement("td");
        td1.className = "pk";
        td1.textContent = k;
        const td2 = document.createElement("td");
        td2.className = "pv";
        const v = props[k];
        td2.textContent =
          typeof v === "object" ? JSON.stringify(v, null, 2) : String(v);
        tr.appendChild(td1);
        tr.appendChild(td2);
        table.appendChild(tr);
      }
      wrap.appendChild(table);
    }

    if (ev.template) {
      const tpl = document.createElement("div");
      tpl.className = "template";
      tpl.innerHTML = '<span class="lbl">template</span> ';
      const code = document.createElement("code");
      code.textContent = ev.template;
      tpl.appendChild(code);
      wrap.appendChild(tpl);
    }

    if (ev.exception) {
      const ex = document.createElement("pre");
      ex.className = "exception";
      ex.textContent = ev.exception;
      wrap.appendChild(ex);
    }

    const meta = [];
    if (ev.line != null) meta.push("line " + ev.line);
    if (ev.eventId != null) meta.push("id " + ev.eventId);
    if (ev.traceId) meta.push("trace " + ev.traceId);
    if (ev.spanId) meta.push("span " + ev.spanId);

    const bar = document.createElement("div");
    bar.className = "detail-bar";
    bar.innerHTML = '<span class="meta">' + escapeHtml(meta.join(" · ")) + "</span>";
    const copyBtn = document.createElement("button");
    copyBtn.className = "ghost small";
    copyBtn.textContent = "Copy JSON";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      vscode.postMessage({
        type: "copy",
        text: JSON.stringify(rawShape(ev), null, 2),
      });
    });
    bar.appendChild(copyBtn);
    wrap.appendChild(bar);

    return wrap;
  }

  function rawShape(ev) {
    const o = {};
    if (ev.t) o["@t"] = ev.t;
    o["@l"] = ev.level;
    if (ev.template) o["@mt"] = ev.template;
    if (ev.rendered) o["@m"] = ev.rendered;
    if (ev.exception) o["@x"] = ev.exception;
    Object.assign(o, ev.properties || {});
    return o;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[ch];
    });
  }

  // --- Events ---------------------------------------------------------------
  let searchTimer = null;
  els.search.addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTerm = els.search.value.trim().toLowerCase();
      renderList();
    }, 120);
  });
  els.clearSearch.addEventListener("click", () => {
    els.search.value = "";
    searchTerm = "";
    renderList();
    els.search.focus();
  });
  els.follow.addEventListener("change", () => {
    follow = els.follow.checked;
    if (follow) els.list.scrollTop = els.list.scrollHeight;
  });
  els.openRaw.addEventListener("click", () =>
    vscode.postMessage({ type: "openRaw" })
  );
  els.refresh.addEventListener("click", () =>
    vscode.postMessage({ type: "refresh" })
  );
  els.poll.addEventListener("change", () =>
    vscode.postMessage({ type: "setPolling", enabled: els.poll.checked })
  );

  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg.type === "load") {
      allEvents = msg.events || [];
      parseErrors = msg.parseErrors || [];
      renderLevels();
      renderList();
    } else if (msg.type === "pollingState") {
      els.poll.checked = !!msg.enabled;
      const seconds = msg.intervalMs ? (msg.intervalMs / 1000).toString() : "";
      els.pollLabel.title = seconds
        ? "Automatically poll the file on disk for changes (every " +
          seconds +
          "s)"
        : "Automatically poll the file on disk for changes";
    }
  });

  vscode.postMessage({ type: "ready" });
})();
