const STORAGE_KEY = "calc.settings.v1";
const HISTORY_KEY = "calc.history.v1";
const SHORTCUTS_KEY = "calc.shortcuts.v1";

const defaultSettings = {
  theme: "system", // system | light | dark
  accent: "indigo", // indigo | cyan | rose | amber
  angleUnit: "rad", // rad | deg
  proMode: false,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.slice(0, 50) : [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 50)));
}

function defaultShortcuts() {
  return {
    "app.evaluate": ["Enter", "Ctrl+Enter"],
    "app.clearAll": ["Escape"],
    "app.backspace": ["Backspace"],
    "app.focusExpr": ["Ctrl+L"],
    "app.openSettings": ["Ctrl+,"],
    "app.toggleProMode": ["Ctrl+P"],
    "history.clear": ["Ctrl+Shift+Backspace"],
    "insert.ans": ["Alt+A"],
    "insert.pi": ["Alt+P"],
    "insert.sqrt": ["Alt+R"],
    "insert.pow": ["Alt+^"],
    "insert.percent": ["Alt+%"],
    "insert.sin": ["Alt+S"],
    "insert.cos": ["Alt+C"],
    "insert.tan": ["Alt+T"],
    "toggle.angleUnit": ["Ctrl+Alt+G"]
  };
}

function loadShortcutsLocal() {
  try {
    const raw = localStorage.getItem(SHORTCUTS_KEY);
    if (!raw) return defaultShortcuts();
    const parsed = JSON.parse(raw);
    return { ...defaultShortcuts(), ...(parsed || {}) };
  } catch {
    return defaultShortcuts();
  }
}

function saveShortcutsLocal(map) {
  localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(map));
}

function setTheme(settings) {
  const root = document.documentElement;
  const theme = settings.theme;
  const accent = settings.accent;

  root.dataset.accent = accent || "indigo";

  if (theme === "light") root.dataset.theme = "light";
  else if (theme === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
}

function qs(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

const exprInput = qs("exprInput");
const resultEl = qs("result");
const hintEl = qs("hint");
const keypad = qs("keypad");
const modeLabel = qs("modeLabel");
const sidePanel = qs("sidePanel");

const settingsBtn = qs("settingsBtn");
const angleChip = qs("angleChip");
const settingsModal = qs("settingsModal");
const themeSelect = qs("themeSelect");
const accentSelect = qs("accentSelect");
const angleSelect = qs("angleSelect");
const saveSettingsBtn = qs("saveSettingsBtn");
const shortcutsList = qs("shortcutsList");
const shortcutCaptureHint = qs("shortcutCaptureHint");
const resetShortcutsBtn = qs("resetShortcutsBtn");
const exportConfigBtn = qs("exportConfigBtn");
const importConfigBtn = qs("importConfigBtn");
const importConfigFile = qs("importConfigFile");

const toggleModeBtn = qs("toggleModeBtn");
const clearBtn = qs("clearBtn");

const fnChips = qs("fnChips");
const historyEl = qs("history");
const clearHistoryBtn = qs("clearHistoryBtn");

let settings = loadSettings();
let history = loadHistory();
let lastAnswer = "0";
let shortcuts = loadShortcutsLocal();
let captureActionId = null;
let captureMode = "replace"; // replace | append

function setProMode(enabled) {
  settings.proMode = !!enabled;
  modeLabel.textContent = settings.proMode ? "Pro mode" : "Basic mode";
  sidePanel.classList.toggle("is-pro", settings.proMode);
  toggleModeBtn.textContent = settings.proMode ? "Basic" : "Pro";
  renderKeypad();
  renderFunctions();
  renderHistory();
  persistConfigEverywhere();
}

function updateAngleChip() {
  angleChip.textContent = (settings.angleUnit || "rad").toUpperCase();
}

function insertText(text) {
  const start = exprInput.selectionStart ?? exprInput.value.length;
  const end = exprInput.selectionEnd ?? exprInput.value.length;
  const before = exprInput.value.slice(0, start);
  const after = exprInput.value.slice(end);
  exprInput.value = before + text + after;
  const pos = start + text.length;
  exprInput.setSelectionRange(pos, pos);
  exprInput.focus();
}

function insertPercent() {
  const v = exprInput.value;
  const start = exprInput.selectionStart ?? v.length;
  const end = exprInput.selectionEnd ?? v.length;
  const selected = v.slice(start, end);
  if (selected) {
    insertText(`(${selected})*0.01`);
    return;
  }

  const left = v.slice(0, start);
  const right = v.slice(end);
  const canApply = /(\d|\)|pi|e)$/i.test(left.trim());
  const insertion = canApply ? "*0.01" : "0.01";
  exprInput.value = left + insertion + right;
  const pos = start + insertion.length;
  exprInput.setSelectionRange(pos, pos);
  exprInput.focus();
}

function backspace() {
  const start = exprInput.selectionStart ?? 0;
  const end = exprInput.selectionEnd ?? 0;
  if (start !== end) {
    insertText("");
    return;
  }
  if (start <= 0) return;
  const before = exprInput.value.slice(0, start - 1);
  const after = exprInput.value.slice(end);
  exprInput.value = before + after;
  const pos = start - 1;
  exprInput.setSelectionRange(pos, pos);
  exprInput.focus();
}

function clearAll() {
  exprInput.value = "";
  hintEl.textContent = "";
  resultEl.textContent = "0";
  exprInput.focus();
}

function normalizeForApi(expr) {
  return expr
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("Ans", "ans")
    .replaceAll("ANS", "ans")
    .replaceAll("ans", `(${lastAnswer})`);
}

async function evaluateExpr() {
  const expr = exprInput.value.trim();
  if (!expr) return;

  hintEl.textContent = "Calculating...";

  try {
    const res = await fetch(`/api/eval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expr: normalizeForApi(expr), angleUnit: settings.angleUnit }),
    });
    const data = await res.json();
    if (data.ok) {
      resultEl.textContent = data.result;
      hintEl.textContent = "";
      lastAnswer = data.result;
      pushHistory(expr, data.result);
    } else {
      hintEl.textContent = data.error || "Error";
    }
  } catch {
    hintEl.textContent = "Cannot reach the backend. Run `python start.py`.";
  }
}

function pushHistory(expr, result) {
  const item = { expr, result, t: Date.now() };
  history = [item, ...history].slice(0, 50);
  saveHistory(history);
  renderHistory();
}

function renderHistory() {
  historyEl.innerHTML = "";
  if (!settings.proMode) return;

  if (history.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hist-item";
    empty.textContent = "No calculations yet.";
    historyEl.appendChild(empty);
    return;
  }

  for (const item of history) {
    const row = document.createElement("div");
    row.className = "hist-item";
    row.tabIndex = 0;

    const e = document.createElement("div");
    e.className = "hist-expr";
    e.textContent = item.expr;

    const r = document.createElement("div");
    r.className = "hist-res";
    r.textContent = item.result;

    row.appendChild(e);
    row.appendChild(r);
    row.addEventListener("click", () => {
      exprInput.value = item.expr;
      exprInput.focus();
    });
    row.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") row.click();
    });
    historyEl.appendChild(row);
  }
}

function renderFunctions() {
  fnChips.innerHTML = "";
  if (!settings.proMode) return;

  const fns = [
    { label: "sin()", ins: "sin()" },
    { label: "cos()", ins: "cos()" },
    { label: "tan()", ins: "tan()" },
    { label: "asin()", ins: "asin()" },
    { label: "acos()", ins: "acos()" },
    { label: "atan()", ins: "atan()" },
    { label: "ln()", ins: "ln()" },
    { label: "log(x,10)", ins: "log(,10)" },
    { label: "sqrt()", ins: "sqrt()" },
    { label: "pow(a,b)", ins: "pow(,)" },
    { label: "factorial()", ins: "factorial()" },
    { label: "pi", ins: "pi" },
    { label: "e", ins: "e" },
    { label: "Ans", ins: "Ans" },
  ];

  for (const item of fns) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = item.label;
    b.addEventListener("click", () => {
      insertText(item.ins);
      const pos = exprInput.value.indexOf("()", exprInput.selectionStart - item.ins.length);
      if (pos !== -1 && item.ins.endsWith("()")) {
        const cursor = pos + 1;
        exprInput.setSelectionRange(cursor, cursor);
      } else if (item.ins.includes(",")) {
        const cursor = exprInput.value.lastIndexOf("(") + 1;
        exprInput.setSelectionRange(cursor, cursor);
      }
    });
    fnChips.appendChild(b);
  }
}

function actionRegistry() {
  return [
    { id: "app.evaluate", title: "Calculer (=)", run: () => evaluateExpr() },
    { id: "app.clearAll", title: "Effacer (C)", run: () => clearAll() },
    { id: "app.backspace", title: "Backspace (⌫)", run: () => backspace() },
    { id: "app.focusExpr", title: "Focus expression", run: () => exprInput.focus() },
    { id: "app.openSettings", title: "Open settings", run: () => openSettings() },
    { id: "app.toggleProMode", title: "Toggle Pro mode", run: () => setProMode(!settings.proMode) },
    { id: "history.clear", title: "Clear history", run: () => clearHistoryBtn.click() },
    { id: "insert.ans", title: "Insert Ans", run: () => insertText("Ans") },
    { id: "insert.pi", title: "Insert pi", run: () => insertText("pi") },
    { id: "insert.sqrt", title: "Insert sqrt()", run: () => insertText("sqrt()") },
    { id: "insert.pow", title: "Insert ^", run: () => insertText("^") },
    { id: "insert.percent", title: "Pourcentage", run: () => insertPercent() },
    { id: "insert.sin", title: "Insert sin()", run: () => insertText("sin()") },
    { id: "insert.cos", title: "Insert cos()", run: () => insertText("cos()") },
    { id: "insert.tan", title: "Insert tan()", run: () => insertText("tan()") },
    {
      id: "toggle.angleUnit",
      title: "Toggle rad/deg",
      run: () => {
        settings.angleUnit = settings.angleUnit === "rad" ? "deg" : "rad";
        angleSelect.value = settings.angleUnit;
        saveSettings(settings);
      },
    },
  ];
}

function normalizeKeyName(key) {
  if (!key) return "";
  const k = key;
  if (k === " ") return "Space";
  if (k === "Esc") return "Escape";
  if (k.length === 1) return k.toUpperCase();
  return k;
}

function eventToShortcut(ev) {
  const parts = [];
  if (ev.ctrlKey) parts.push("Ctrl");
  if (ev.altKey) parts.push("Alt");
  if (ev.metaKey) parts.push("Meta");
  if (ev.shiftKey) parts.push("Shift");

  const key = normalizeKeyName(ev.key);
  if (!key || key === "Control" || key === "Shift" || key === "Alt" || key === "Meta") return null;
  parts.push(key);
  return parts.join("+");
}

function renderShortcuts() {
  shortcutsList.innerHTML = "";
  const actions = actionRegistry();

  for (const a of actions) {
    const row = document.createElement("div");
    row.className = "sc-row";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "sc-title";
    title.textContent = a.title;
    const meta = document.createElement("div");
    meta.className = "sc-meta";

    const list = shortcuts[a.id] || [];
    if (list.length === 0) {
      const pill = document.createElement("span");
      pill.className = "kbd empty";
      pill.textContent = "None";
      meta.appendChild(pill);
    } else {
      for (const sc of list) {
        const pill = document.createElement("span");
        pill.className = "kbd";
        pill.textContent = sc;
        meta.appendChild(pill);
      }
    }

    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "sc-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn";
    edit.textContent = captureActionId === a.id && captureMode === "replace" ? "Listening..." : "Edit";
    edit.addEventListener("click", () => {
      captureActionId = a.id;
      captureMode = "replace";
      shortcutCaptureHint.textContent = `Action: ${a.title} — press a shortcut (Esc to cancel)`;
      renderShortcuts();
    });

    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn";
    add.textContent = captureActionId === a.id && captureMode === "append" ? "Listening..." : "Add";
    add.addEventListener("click", () => {
      captureActionId = a.id;
      captureMode = "append";
      shortcutCaptureHint.textContent = `Action: ${a.title} — add a shortcut (Esc to cancel)`;
      renderShortcuts();
    });

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "btn";
    clear.textContent = "Clear";
    clear.addEventListener("click", () => {
      shortcuts[a.id] = [];
      persistShortcuts();
      renderShortcuts();
    });

    right.appendChild(edit);
    right.appendChild(add);
    right.appendChild(clear);

    row.appendChild(left);
    row.appendChild(right);
    shortcutsList.appendChild(row);
  }
}

async function persistShortcuts() {
  saveShortcutsLocal(shortcuts);
}

async function persistConfigEverywhere() {
  saveSettings(settings);
  saveShortcutsLocal(shortcuts);
  await persistShortcuts();
}

function findActionByShortcut(sc) {
  const actions = actionRegistry();
  for (const a of actions) {
    const list = shortcuts[a.id] || [];
    if (list.some((x) => x === sc)) return a;
  }
  return null;
}

function mkKey(label, action, opts = {}) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `key ${opts.className || ""}`.trim();
  b.textContent = label;
  b.addEventListener("click", action);
  return b;
}

function renderKeypad() {
  keypad.innerHTML = "";

  const common = [
    ["C", () => clearAll(), { className: "op" }],
    ["(", () => insertText("("), { className: "op" }],
    [")", () => insertText(")"), { className: "op" }],
    ["÷", () => insertText("÷"), { className: "op" }],

    ["7", () => insertText("7")],
    ["8", () => insertText("8")],
    ["9", () => insertText("9")],
    ["×", () => insertText("×"), { className: "op" }],

    ["4", () => insertText("4")],
    ["5", () => insertText("5")],
    ["6", () => insertText("6")],
    ["−", () => insertText("-"), { className: "op" }],

    ["1", () => insertText("1")],
    ["2", () => insertText("2")],
    ["3", () => insertText("3")],
    ["+", () => insertText("+"), { className: "op" }],

    ["0", () => insertText("0"), { className: "wide" }],
    [".", () => insertText(".")],
    ["=", () => evaluateExpr(), { className: "equals" }],
  ];

  const proRow = settings.proMode
    ? [
        ["^", () => insertText("^"), { className: "op" }],
        ["%", () => insertPercent(), { className: "op" }],
        ["pi", () => insertText("pi"), { className: "op" }],
        ["Ans", () => insertText("Ans"), { className: "op" }],
      ]
    : [];

  const keys = [...proRow, ...common];
  for (const [label, fn, opts] of keys) keypad.appendChild(mkKey(label, fn, opts));
}

function openSettings() {
  themeSelect.value = settings.theme;
  accentSelect.value = settings.accent;
  angleSelect.value = settings.angleUnit;
  settingsModal.showModal();
  renderShortcuts();
}

function applySettingsFromUI() {
  settings.theme = themeSelect.value;
  settings.accent = accentSelect.value;
  settings.angleUnit = angleSelect.value;
  setTheme(settings);
  persistConfigEverywhere();
  updateAngleChip();
}

// Wire events
settingsBtn.addEventListener("click", openSettings);
saveSettingsBtn.addEventListener("click", () => applySettingsFromUI());
themeSelect.addEventListener("change", () => applySettingsFromUI());
accentSelect.addEventListener("change", () => applySettingsFromUI());
angleSelect.addEventListener("change", () => applySettingsFromUI());

angleChip.addEventListener("click", () => {
  settings.angleUnit = settings.angleUnit === "rad" ? "deg" : "rad";
  angleSelect.value = settings.angleUnit;
  updateAngleChip();
  persistConfigEverywhere();
});
resetShortcutsBtn.addEventListener("click", () => {
  shortcuts = defaultShortcuts();
  captureActionId = null;
  shortcutCaptureHint.textContent = "";
  persistConfigEverywhere();
  renderShortcuts();
});

exportConfigBtn.addEventListener("click", async () => {
  const cfg = {
    version: 1,
    actions: actionRegistry().map((a) => ({ id: a.id, title: a.title })),
    settings: { theme: settings.theme, accent: settings.accent, angleUnit: settings.angleUnit, proMode: settings.proMode },
    shortcuts,
  };
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "config.json";
  a.click();
  URL.revokeObjectURL(url);
});

importConfigBtn.addEventListener("click", () => importConfigFile.click());
importConfigFile.addEventListener("change", async () => {
  const file = importConfigFile.files && importConfigFile.files[0];
  importConfigFile.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    const cfg = JSON.parse(text);
    if (cfg && cfg.settings) {
      settings = { ...settings, ...cfg.settings };
      saveSettings(settings);
      setTheme(settings);
      setProMode(!!settings.proMode);
    }
    if (cfg && cfg.shortcuts) {
      shortcuts = { ...defaultShortcuts(), ...cfg.shortcuts };
      saveShortcutsLocal(shortcuts);
    }
    await persistConfigEverywhere();
    renderShortcuts();
  } catch {
    shortcutCaptureHint.textContent = "Import failed (invalid JSON).";
  }
});

toggleModeBtn.addEventListener("click", () => setProMode(!settings.proMode));
clearBtn.addEventListener("click", () => backspace());
clearHistoryBtn.addEventListener("click", () => {
  history = [];
  saveHistory(history);
  renderHistory();
});

exprInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    evaluateExpr();
  } else if (ev.key === "Escape") {
    ev.preventDefault();
    clearAll();
  }
});

document.addEventListener("keydown", (ev) => {
  if (captureActionId) {
    if (ev.key === "Escape") {
      captureActionId = null;
      captureMode = "replace";
      shortcutCaptureHint.textContent = "";
      renderShortcuts();
      return;
    }

    ev.preventDefault();
    const sc = eventToShortcut(ev);
    if (!sc) return;

    const existing = shortcuts[captureActionId] || [];
    if (captureMode === "append") {
      const next = existing.filter((x) => x !== sc);
      next.unshift(sc);
      shortcuts[captureActionId] = next.slice(0, 3);
    } else {
      shortcuts[captureActionId] = [sc];
    }
    captureActionId = null;
    shortcutCaptureHint.textContent = "Shortcut saved.";
    persistConfigEverywhere();
    renderShortcuts();
    return;
  }

  const sc = eventToShortcut(ev);
  if (sc) {
    const tag = (ev.target && ev.target.tagName ? ev.target.tagName : "").toLowerCase();
    const inInput = tag === "input" || tag === "textarea" || tag === "select";
    const hasModifier = ev.ctrlKey || ev.altKey || ev.metaKey;
    if (inInput && !hasModifier) return;

    const action = findActionByShortcut(sc);
    if (action) {
      ev.preventDefault();
      action.run();
      return;
    }
  }

  if (settingsModal.open) return;
  const tag2 = (ev.target && ev.target.tagName ? ev.target.tagName : "").toLowerCase();
  if (tag2 === "input" || tag2 === "textarea" || tag2 === "select" || tag2 === "button") return;

  const isTypingKey = ev.key.length === 1 && !ev.metaKey && !ev.ctrlKey && !ev.altKey;
  if (isTypingKey) {
    exprInput.focus();
    insertText(ev.key);
  }
});

// Init
setTheme(settings);
setProMode(settings.proMode);
updateAngleChip();
renderKeypad();
renderFunctions();
renderHistory();
renderShortcuts();
exprInput.focus();
