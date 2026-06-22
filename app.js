"use strict";

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const authView = $("auth");
const appView = $("app");
const readerView = $("reader");
const configError = $("config-error");

const form = $("auth-form");
const emailEl = $("email");
const passwordEl = $("password");
const primaryBtn = $("primary-btn");
const msgEl = $("auth-msg");
const toggleText = $("toggle-text");
const toggleLink = $("toggle-link");
const forgotLink = $("forgot-link");

const recoveryView = $("recovery");
const recoveryForm = $("recovery-form");
const newPasswordEl = $("new-password");
const newPassword2El = $("new-password2");
const recoveryBtn = $("recovery-btn");
const recoveryMsg = $("recovery-msg");

const sidebar = $("sidebar");
const backdrop = $("backdrop");
const noteListEl = $("note-list");
const searchEl = $("search");
const newNoteBtn = $("new-note");
const fabNew = $("fab-new");
const whoEl = $("who");
const logoutBtn = $("logout");

const menuToggle = $("menu-toggle");
const titleEl = $("title");
const countsEl = $("counts");
const menuCountsEl = $("menu-counts");
const statusEl = $("status");
const editorHost = $("editor");
const pad = $("pad"); // textarea fallback if the rich editor fails
const toggleModeBtn = $("toggle-mode");
const toggleThemeBtn = $("toggle-theme");
const moreBtn = $("more");
const menuPop = $("menu-pop");
const pinBtn = $("pin-btn");
const shareBtn = $("share-btn");
const importBtn = $("import-btn");
const importInput = $("import-input");
const exportMdBtn = $("export-md");
const exportTxtBtn = $("export-txt");
const exportZipBtn = $("export-zip");
const printBtn = $("print-btn");
const trashBtn = $("trash-btn");
const settingsBtn = $("settings-btn");
const deleteBtn = $("delete-btn");

const tagChips = $("tag-chips");
const tagInput = $("tag-input");

const sharePanel = $("share-panel");
const shareToggle = $("share-toggle");
const shareLinkRow = $("share-link-row");
const shareLinkEl = $("share-link");
const copyLinkBtn = $("copy-link");

const guestLink = $("guest-link");
const guestBanner = $("guest-banner");
const guestSigninBtn = $("guest-signin");

const palette = $("palette");
const paletteInput = $("palette-input");
const paletteList = $("palette-list");

const trashModal = $("trash-modal");
const trashList = $("trash-list");
const trashClose = $("trash-close");
const emptyTrashBtn = $("empty-trash");

const settingsModal = $("settings-modal");
const settingsClose = $("settings-close");
const settingsEmail = $("settings-email");
const emailForm = $("email-form");
const newEmailEl = $("new-email");
const passwordForm = $("password-form");
const settingsPasswordEl = $("settings-password");
const settingsMsg = $("settings-msg");
const deleteAccountBtn = $("delete-account");

const printArea = $("print-area");

const formModal = $("form-modal");
const formClose = $("form-close");
const formInsert = $("form-insert");
const formMsg = $("form-msg");
const formPdfBtn = $("form-pdf-btn");
const generatePdfBtn = $("generate-pdf");
const fillBrowserBtn = $("fill-browser-btn");

const fillView = $("fill-view");
const fillBack = $("fill-back");
const fillTitleEl = $("fill-title");
const fillDownloadBtn = $("fill-download");
const fillPrintBtn = $("fill-print");
const fillFormEl = $("fill-form");

const fillLinkBlock = $("fill-link-block");
const fillLinkEl = $("fill-link");
const copyFillBtn = $("copy-fill");

// ---------------------------------------------------------------------------
// Config / state
// ---------------------------------------------------------------------------
const cfg = window.BLANK_PAGE_CONFIG || {};
const configured =
  cfg.SUPABASE_URL &&
  cfg.SUPABASE_ANON_KEY &&
  cfg.SUPABASE_URL !== "YOUR_SUPABASE_URL" &&
  cfg.SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY";

const COLS = "id, title, content, is_public, pinned, tags, updated_at, deleted_at";
const CACHE_KEY = "blankpage.notes.cache";
const PENDING_KEY = "blankpage.pending"; // edits made offline, awaiting sync
const GUEST_KEY = "blankpage.guest";
const GUEST_FLAG = "blankpage.guest.active";
const GUEST_IMPORT = "blankpage.guest.import";
const TRASH_DAYS = 30;

let client = null;
let currentUser = null;
let guest = false;
let notes = [];
let trashData = [];
let activeId = null;
let mode = "login";
let recovering = false;
let realtimeChannel = null;
let editor = null; // Toast UI Editor instance
let suppressChange = false; // ignore editor change events while loading a note
let editorReady = false; // true once the editor (or fallback) is usable
let usingFallback = false; // true if we fell back to the plain textarea

// ---------------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------------
function showView(view) {
  [authView, appView, readerView, configError, recoveryView, fillView].forEach(
    (v) => v.classList.add("hidden")
  );
  view.classList.remove("hidden");
}

function setMode(next) {
  mode = next;
  msgEl.textContent = "";
  msgEl.className = "msg";
  passwordEl.classList.toggle("hidden", mode === "forgot");
  passwordEl.required = mode !== "forgot";
  forgotLink.parentElement.classList.toggle("hidden", mode !== "login");
  if (mode === "login") {
    primaryBtn.textContent = "Log in";
    toggleText.textContent = "Don't have an account?";
    toggleLink.textContent = "Sign up";
    passwordEl.autocomplete = "current-password";
  } else if (mode === "signup") {
    primaryBtn.textContent = "Sign up";
    toggleText.textContent = "Already have an account?";
    toggleLink.textContent = "Log in";
    passwordEl.autocomplete = "new-password";
  } else {
    primaryBtn.textContent = "Send reset link";
    toggleText.textContent = "Remembered it?";
    toggleLink.textContent = "Back to log in";
  }
}

function setMsg(text, kind = "error") {
  msgEl.textContent = text;
  msgEl.className = "msg " + kind;
}

function renderMarkdown(text) {
  const raw = window.marked.parse(text || "", { breaks: true });
  return window.DOMPurify.sanitize(raw);
}

// ---------------------------------------------------------------------------
// Editor (Toast UI) — Markdown source with a built-in WYSIWYG toggle.
// Markdown stays the canonical value, so storage/PDF/share are unaffected.
// ---------------------------------------------------------------------------
const TUI_JS = "https://cdn.jsdelivr.net/npm/@toast-ui/editor@3.2.2/dist/toastui-editor-all.min.js";
const TUI_CSS = "https://cdn.jsdelivr.net/npm/@toast-ui/editor@3.2.2/dist/toastui-editor.min.css";

// Ensure the Toast UI library is available, loading it dynamically if the
// (possibly stale-cached) HTML didn't include it. Resolves true/false.
function ensureToastUi() {
  return new Promise((resolve) => {
    if (window.toastui && window.toastui.Editor) return resolve(true);
    if (!document.querySelector('link[href*="toastui-editor"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = TUI_CSS;
      document.head.appendChild(link);
    }
    const s = document.createElement("script");
    s.src = TUI_JS;
    s.onload = () => resolve(!!(window.toastui && window.toastui.Editor));
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

function loadCurrentIntoEditor() {
  if (guest) {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(GUEST_KEY)) || {}; } catch (_) {}
    setEditorValue(s.content || "");
    updateCounts();
  } else if (activeId) {
    const n = activeNote();
    if (n) { setEditorValue(n.content || ""); updateCounts(); }
  }
}

function initEditor() {
  if (editor || usingFallback || editorReady) return;
  ensureToastUi().then((available) => {
    if (!available) {
      useFallback("Toast UI library failed to load from CDN");
      loadCurrentIntoEditor();
      return;
    }
    // Create after layout settles so the editor doesn't render at 0 height.
    requestAnimationFrame(() => {
      try {
        editor = new window.toastui.Editor({
          el: editorHost,
          height: "100%",
          initialEditType: "markdown",
          previewStyle: "tab",
          usageStatistics: false,
          autofocus: false,
          placeholder: "Start writing… (Markdown supported)",
          events: { change: onEdit },
        });
        suppressChange = true;
        editor.setMarkdown("probe", false);
        const ok = editor.getMarkdown && editor.getMarkdown().indexOf("probe") !== -1;
        editor.setMarkdown("", false);
        suppressChange = false;
        if (!ok) throw new Error("editor self-test failed");
        editorReady = true;
        applyEditorTheme();
      } catch (e) {
        console.error("Toast UI Editor failed; using plain textarea.", e);
        try { if (editor) editor.destroy(); } catch (_) {}
        editor = null;
        useFallback("Editor threw on init");
      }
      loadCurrentIntoEditor();
    });
  });
}

// Plain-textarea fallback so the app always has a working editor.
function useFallback(reason) {
  if (usingFallback) return;
  usingFallback = true;
  editorReady = true;
  if (reason) console.warn("Editor fallback:", reason);
  editorHost.classList.add("hidden");
  pad.classList.remove("hidden");
  pad.addEventListener("input", onEdit);
}

function getEditorValue() {
  if (usingFallback) return pad.value;
  return editor ? editor.getMarkdown() : "";
}
function setEditorValue(md) {
  if (usingFallback) {
    pad.value = md || "";
    return;
  }
  if (!editor) return;
  suppressChange = true;
  editor.setMarkdown(md || "", false);
  suppressChange = false;
}
function insertIntoEditor(text) {
  if (usingFallback) {
    const s = pad.selectionStart || 0;
    const e = pad.selectionEnd || 0;
    pad.value = pad.value.slice(0, s) + text + pad.value.slice(e);
    pad.setSelectionRange(s + text.length, s + text.length);
    pad.focus();
    onEdit();
    return;
  }
  if (editor) editor.insertText(text);
}
function applyEditorTheme() {
  if (!editor || usingFallback) return;
  const dark = document.documentElement.dataset.theme === "dark";
  // Toast UI marks dark mode with .toastui-editor-dark on its root UI element.
  const root = editorHost.querySelector(".toastui-editor-defaultUI");
  if (root) root.classList.toggle("toastui-editor-dark", dark);
}

// Explicit Markdown ⇄ formatted (WYSIWYG) toggle in the toolbar.
let wysiwyg = false;
function updateModeButton() {
  toggleModeBtn.textContent = wysiwyg ? "Markdown" : "Formatted";
}
toggleModeBtn.addEventListener("click", () => {
  if (!editorReady) return;
  if (usingFallback || !editor) {
    alert(
      "The formatted (WYSIWYG) editor didn't load in this browser, so you're " +
        "using the plain Markdown text box. Check the console for an 'Editor " +
        "fallback' message."
    );
    return;
  }
  wysiwyg = !wysiwyg;
  editor.changeMode(wysiwyg ? "wysiwyg" : "markdown", true);
  updateModeButton();
});

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  toggleThemeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#1a1a1a" : "#fbfbf9";
  applyEditorTheme();
}

function initTheme() {
  const stored = localStorage.getItem("blankpage.theme");
  const prefersDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(stored || (prefersDark ? "dark" : "light"));
}

function toggleTheme() {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("blankpage.theme", next);
  applyTheme(next);
}
toggleThemeBtn.addEventListener("click", toggleTheme);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
toggleLink.addEventListener("click", (e) => {
  e.preventDefault();
  setMode(mode === "login" ? "signup" : "login");
});

forgotLink.addEventListener("click", (e) => {
  e.preventDefault();
  setMode("forgot");
  emailEl.focus();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("");
  const email = emailEl.value.trim();
  const password = passwordEl.value;
  primaryBtn.disabled = true;
  try {
    if (mode === "forgot") {
      const redirectTo = location.origin + location.pathname;
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) return setMsg(error.message);
      setMsg("If that email has an account, a reset link is on its way.", "ok");
      return;
    }
    if (mode === "signup") {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) return setMsg(error.message);
      if (!data.session) {
        setMsg("Account created. Check your email to confirm, then log in.", "ok");
        setMode("login");
        return;
      }
    } else {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) return setMsg(error.message);
    }
    passwordEl.value = "";
  } finally {
    primaryBtn.disabled = false;
  }
});

recoveryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  recoveryMsg.textContent = "";
  recoveryMsg.className = "msg";
  const pw = newPasswordEl.value;
  const pw2 = newPassword2El.value;
  if (pw.length < 6) {
    recoveryMsg.textContent = "Password must be at least 6 characters.";
    recoveryMsg.className = "msg error";
    return;
  }
  if (pw !== pw2) {
    recoveryMsg.textContent = "Passwords don't match.";
    recoveryMsg.className = "msg error";
    return;
  }
  recoveryBtn.disabled = true;
  try {
    const { data, error } = await client.auth.updateUser({ password: pw });
    if (error) {
      recoveryMsg.textContent = error.message;
      recoveryMsg.className = "msg error";
      return;
    }
    recovering = false;
    newPasswordEl.value = "";
    newPassword2El.value = "";
    history.replaceState(null, "", location.pathname);
    if (data && data.user) enterApp(data.user);
  } finally {
    recoveryBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  await flush();
  await client.auth.signOut();
});

// ---------------------------------------------------------------------------
// Notes: load / render / select
// ---------------------------------------------------------------------------
function cacheNotes() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(notes));
  } catch (_) {}
}
function loadCachedNotes() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || [];
  } catch (_) {
    return [];
  }
}

function sortNotes() {
  notes.sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return (b.updated_at || "").localeCompare(a.updated_at || "");
  });
}

async function loadNotes() {
  const { data, error } = await client
    .from("notes")
    .select(COLS)
    .is("deleted_at", null)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    notes = loadCachedNotes();
    statusEl.textContent = "Offline";
  } else {
    notes = data || [];
    cacheNotes();
    await maybeImportGuestNote();
    purgeOldTrash();
    subscribeRealtime();
    syncPending();
  }

  if (notes.length === 0) {
    await createNote();
  } else {
    sortNotes();
    renderList();
    openNote(notes[0].id);
  }
}

function activeNote() {
  return notes.find((n) => n.id === activeId) || null;
}

function noteTitle(n) {
  if (n.title && n.title.trim()) return n.title;
  const firstLine = (n.content || "").split("\n")[0].trim();
  return firstLine || "Untitled";
}

function matchesSearch(n, q) {
  if (!q) return true;
  return (
    noteTitle(n).toLowerCase().includes(q) ||
    (n.content || "").toLowerCase().includes(q) ||
    (n.tags || []).join(" ").toLowerCase().includes(q)
  );
}

function renderList() {
  const q = searchEl.value.trim().toLowerCase();
  const items = notes.filter((n) => matchesSearch(n, q));

  noteListEl.innerHTML = "";
  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "note-empty";
    li.textContent = q ? "No matches" : "No notes yet";
    noteListEl.appendChild(li);
    return;
  }

  for (const n of items) {
    const li = document.createElement("li");
    li.className = "note-item" + (n.id === activeId ? " active" : "");
    li.tabIndex = 0;

    const t = document.createElement("div");
    t.className = "note-title";
    const titleText = document.createElement("span");
    titleText.className = "note-title-text";
    titleText.textContent = noteTitle(n);
    t.appendChild(titleText);
    if (n.pinned) {
      const pin = document.createElement("span");
      pin.className = "pin-dot";
      pin.textContent = "📌";
      t.appendChild(pin);
    }
    if (n.is_public) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "shared";
      t.appendChild(badge);
    }

    const sub = document.createElement("div");
    sub.className = "note-sub";
    const snippet = (n.content || "").replace(/\s+/g, " ").trim().slice(0, 60);
    sub.textContent = snippet || "Empty";

    li.appendChild(t);
    li.appendChild(sub);
    li.addEventListener("click", () => {
      openNote(n.id);
      closeSidebarMobile();
    });
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter") openNote(n.id);
    });
    noteListEl.appendChild(li);
  }
}

function openNote(id) {
  if (activeId && activeId !== id) flush();
  activeId = id;
  const n = activeNote();
  if (!n) return;
  titleEl.value = n.title || "";
  setEditorValue(n.content || "");
  updateCounts();
  updateShareUI();
  updatePinUI();
  renderTags();
  statusEl.textContent = "Saved";
  renderList();
}

async function createNote() {
  const draft = {
    user_id: currentUser.id,
    title: "",
    content: "",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from("notes")
    .insert(draft)
    .select(COLS)
    .single();
  if (error) {
    reportDbError("Couldn't create note", error);
    return;
  }
  notes.unshift(data);
  cacheNotes();
  sortNotes();
  renderList();
  openNote(data.id);
  titleEl.focus();
}

newNoteBtn.addEventListener("click", () => {
  createNote();
  closeSidebarMobile();
});

// Soft delete → trash.
deleteBtn.addEventListener("click", async () => {
  const n = activeNote();
  if (!n) return;
  if (!confirm(`Move "${noteTitle(n)}" to trash?`)) return;
  closeMenu();
  const { error } = await client
    .from("notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", n.id);
  if (error) return reportDbError("Couldn't delete note", error);
  notes = notes.filter((x) => x.id !== n.id);
  cacheNotes();
  if (notes.length === 0) await createNote();
  else openNote(notes[0].id);
});

// ---------------------------------------------------------------------------
// Pin
// ---------------------------------------------------------------------------
function updatePinUI() {
  const n = activeNote();
  pinBtn.textContent = n && n.pinned ? "Unpin note" : "Pin note";
}

pinBtn.addEventListener("click", async () => {
  const n = activeNote();
  if (!n) return;
  closeMenu();
  const next = !n.pinned;
  const { error } = await client.from("notes").update({ pinned: next }).eq("id", n.id);
  if (error) return reportDbError("Couldn't pin note", error);
  n.pinned = next;
  cacheNotes();
  sortNotes();
  renderList();
  updatePinUI();
});

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
function renderTags() {
  const n = activeNote();
  tagChips.innerHTML = "";
  if (!n) return;
  for (const tag of n.tags || []) {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = tag;
    const x = document.createElement("button");
    x.type = "button";
    x.className = "tag-x";
    x.textContent = "✕";
    x.title = "Remove tag";
    x.addEventListener("click", () => removeTag(tag));
    chip.appendChild(x);
    tagChips.appendChild(chip);
  }
}

async function saveTags(n) {
  const { error } = await client.from("notes").update({ tags: n.tags }).eq("id", n.id);
  if (error) setStatusError();
  else cacheNotes();
}

function addTag(raw) {
  const n = activeNote();
  if (!n) return;
  const tag = raw.trim().replace(/,/g, "");
  if (!tag) return;
  n.tags = n.tags || [];
  if (!n.tags.includes(tag)) {
    n.tags.push(tag);
    renderTags();
    renderList();
    saveTags(n);
  }
}

function removeTag(tag) {
  const n = activeNote();
  if (!n) return;
  n.tags = (n.tags || []).filter((t) => t !== tag);
  renderTags();
  renderList();
  saveTags(n);
}

tagInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    addTag(tagInput.value);
    tagInput.value = "";
  } else if (e.key === "Backspace" && !tagInput.value) {
    const n = activeNote();
    if (n && n.tags && n.tags.length) removeTag(n.tags[n.tags.length - 1]);
  }
});

// ---------------------------------------------------------------------------
// Editing + autosave (with offline queue)
// ---------------------------------------------------------------------------
let saveTimer = null;
let saving = false;
let dirty = false;

function updateCounts() {
  const text = getEditorValue();
  const words = (text.trim().match(/\S+/g) || []).length;
  const label = `${words} word${words === 1 ? "" : "s"} · ${text.length} char${
    text.length === 1 ? "" : "s"
  }`;
  countsEl.textContent = label;
  menuCountsEl.textContent = label;
}

function setStatusError() {
  statusEl.textContent = "Save failed";
}

// Surface a database error instead of failing silently. A missing column
// (e.g. pinned/tags/deleted_at) means migration-v3.sql hasn't been run.
function reportDbError(context, error) {
  console.error(context, error);
  statusEl.textContent = "Error";
  const msg = (error && error.message) || String(error);
  let hint = "";
  if (/column .* does not exist|deleted_at|pinned|tags/i.test(msg)) {
    hint =
      "\n\nThis usually means the database needs updating — run migration-v3.sql " +
      "in your Supabase SQL editor.";
  }
  alert(context + ": " + msg + hint);
}

function formatSavedTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  return "Saved " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function onEdit() {
  if (suppressChange || !editorReady) return; // ignore until editor is usable
  if (guest) {
    updateCounts();
    statusEl.textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(guestSave, 400);
    return;
  }
  const n = activeNote();
  if (!n) return;
  n.title = titleEl.value;
  n.content = getEditorValue();
  dirty = true;
  updateCounts();
  statusEl.textContent = "Editing…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 700);
}

function guestSave() {
  try {
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify({ title: titleEl.value, content: getEditorValue() })
    );
    statusEl.textContent = "Saved locally";
  } catch (_) {
    statusEl.textContent = "Save failed";
  }
}

// --- offline queue ---
function loadPending() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY)) || {};
  } catch (_) {
    return {};
  }
}
function savePending(obj) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(obj));
  } catch (_) {}
}
function queuePending(n) {
  const q = loadPending();
  q[n.id] = { title: n.title, content: n.content, updated_at: n.updated_at };
  savePending(q);
}
async function syncPending() {
  if (!navigator.onLine) return;
  const q = loadPending();
  const ids = Object.keys(q);
  if (ids.length === 0) return;
  for (const id of ids) {
    const payload = q[id];
    const { error } = await client.from("notes").update(payload).eq("id", id);
    if (!error) {
      const local = notes.find((x) => x.id === id);
      if (local) local.updated_at = payload.updated_at;
      delete q[id];
    }
  }
  savePending(q);
  if (Object.keys(q).length === 0 && !dirty) statusEl.textContent = "Synced";
}

async function save() {
  const n = activeNote();
  if (!n || !dirty) return;
  if (saving) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 500);
    return;
  }
  saving = true;
  statusEl.textContent = "Saving…";
  const now = new Date().toISOString();
  n.updated_at = now;
  const { error } = await client
    .from("notes")
    .update({ title: n.title, content: n.content, updated_at: now })
    .eq("id", n.id);
  saving = false;
  if (error) {
    // Likely offline — keep the edit locally and queue it for later.
    queuePending(n);
    dirty = false;
    cacheNotes();
    statusEl.textContent = navigator.onLine ? "Save failed" : "Offline — will sync";
    return;
  }
  dirty = false;
  cacheNotes();
  statusEl.textContent = formatSavedTime(now);
  sortNotes();
  renderList();
}

async function flush() {
  clearTimeout(saveTimer);
  if (guest) {
    guestSave();
    return;
  }
  if (dirty) await save();
}

// Editor change events are wired in initEditor(); the title has its own input.
titleEl.addEventListener("input", onEdit);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush();
});
window.addEventListener("pagehide", flush);
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    flush();
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("online", () => {
  syncPending();
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
searchEl.addEventListener("input", renderList);

// ---------------------------------------------------------------------------
// Export / import / print
// ---------------------------------------------------------------------------
function download(filename, text) {
  downloadBlob(filename, new Blob([text], { type: "text/plain;charset=utf-8" }));
}
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeName(n, ext) {
  const base = (noteTitle(n) || "note").replace(/[^\w\- ]+/g, "").trim() || "note";
  return base.slice(0, 50) + ext;
}

function currentDoc() {
  return guest ? { title: titleEl.value, content: getEditorValue() } : activeNote();
}

exportMdBtn.addEventListener("click", () => {
  const n = currentDoc();
  if (n) download(safeName(n, ".md"), n.content || "");
  closeMenu();
});
exportTxtBtn.addEventListener("click", () => {
  const n = currentDoc();
  if (n) download(safeName(n, ".txt"), n.content || "");
  closeMenu();
});

exportZipBtn.addEventListener("click", async () => {
  closeMenu();
  if (!window.JSZip || !notes.length) return;
  const zip = new window.JSZip();
  const used = {};
  for (const n of notes) {
    let name = safeName(n, ".md");
    if (used[name]) name = name.replace(/\.md$/, `-${used[name]++}.md`);
    else used[name] = 1;
    zip.file(name, n.content || "");
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob("blank-page-notes.zip", blob);
});

printBtn.addEventListener("click", () => {
  closeMenu();
  const n = currentDoc();
  if (!n) return;
  // The note title is just the user's label; the document supplies its own heading.
  printArea.innerHTML = renderMarkdown(n.content);
  printWithFilename(docHeader(n.content) || noteTitle(n));
});

// ---------------------------------------------------------------------------
// Fillable PDF (AcroForm) generator
// ---------------------------------------------------------------------------
function insertAtCursor(text) {
  insertIntoEditor(text);
}

// Markers like [text: Label], [area: Label], [check: Label], [date: Label],
// [sign: Label], [select: Label = A, B, C].
const FIELD_RE = /\[(text|area|check|date|sign|select)\s*:\s*([^\]=]+?)(?:\s*=\s*([^\]]+))?\]/i;

// Parse a note into ordered tokens; fields get a stable index used to join
// the HTML fill form to the PDF form. Also recognises Markdown blocks
// (headings, horizontal rules, bullet lists, tables) so they render properly.
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}
function stripInline(text) {
  return (text || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}
// The document's own first heading/line (skips blanks and --- rules), used to
// name the saved/downloaded file and the print header.
function docHeader(content) {
  for (const raw of (content || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) continue;
    const text = stripInline(line.replace(/^#{1,6}\s*/, "")).trim();
    if (text) return text;
  }
  return "";
}
// Split a line into styled runs for the PDF renderer.
function parseInline(text) {
  const runs = [];
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) });
    if (m[1]) runs.push({ text: m[2], bold: true });
    else if (m[3]) runs.push({ text: m[4], italic: true });
    else if (m[5]) runs.push({ text: m[5], code: true });
    last = re.lastIndex;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs.length ? runs : [{ text: text || "" }];
}

function tokenizeForm(content) {
  const lines = (content || "").split("\n").map((l) => l.replace(/\r$/, ""));
  const tokens = [];
  let idx = 0, i = 0;
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isSep = (l) => /-/.test(l) && /^\s*\|?[\s:|-]+\|?\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { tokens.push({ type: "blank" }); i++; continue; }

    // Markdown table: a row followed by a |---|---| separator.
    if (isRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      const raw = [splitRow(line)];
      i += 2;
      // Keep collecting rows while lines look like table rows (contain a pipe).
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        raw.push(splitRow(lines[i]));
        i++;
      }
      const cols = Math.max(...raw.map((r) => r.length));
      const rows = raw
        .filter((r) => r.some((c) => c.trim() !== "")) // drop blank spacer rows
        .map((r) =>
          Array.from({ length: cols }, (_, c) => {
            const cell = r[c] || "";
            const fm = cell.match(FIELD_RE);
            if (fm) {
              return {
                field: {
                  idx: idx++,
                  kind: fm[1].toLowerCase(),
                  label: (fm[2] || "").trim(),
                  options: (fm[3] || "").split(",").map((s) => s.trim()).filter(Boolean),
                },
              };
            }
            return { text: cell };
          })
        );
      tokens.push({ type: "table", rows });
      continue;
    }

    const m = line.match(FIELD_RE);
    if (m) {
      tokens.push({
        type: "field",
        idx: idx++,
        kind: m[1].toLowerCase(),
        label: (m[2] || "").trim(),
        options: (m[3] || "").split(",").map((s) => s.trim()).filter(Boolean),
      });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { tokens.push({ type: "hr" }); i++; continue; }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) { tokens.push({ type: "heading", level: h[1].length, text: h[2] }); i++; continue; }
    const li = line.match(/^\s*[-*+]\s+(.*)/);
    if (li) { tokens.push({ type: "li", text: li[1] }); i++; continue; }
    tokens.push({ type: "text", text: line });
    i++;
  }
  return tokens;
}

function hasFields(content) {
  return tokenizeForm(content).some(
    (t) =>
      t.type === "field" ||
      (t.type === "table" && t.rows.some((r) => r.some((c) => c.field)))
  );
}

// Build a PDF with AcroForm fields. `values` (optional, keyed by field idx)
// pre-fills the fields; `flatten` bakes them into a final, non-editable doc.
async function buildPdf(title, tokens, values, flatten) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);
  const boldItal = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const form = doc.getForm();
  const PW = 612, PH = 792, M = 50;
  const ink = rgb(0.1, 0.1, 0.1);
  const border = rgb(0.7, 0.7, 0.7);
  let page = doc.addPage([PW, PH]);
  let y = PH - M;
  const val = (i) => (values ? values[i] : undefined);
  const pickFont = (r) =>
    r.code ? mono : r.bold && r.italic ? boldItal : r.bold ? bold : r.italic ? ital : font;

  // The standard PDF fonts can't encode smart punctuation / non-Latin glyphs,
  // which would throw. Normalise common ones and drop anything left over.
  const enc = (s) =>
    String(s == null ? "" : s)
      .replace(/[‘’‚]/g, "'")
      .replace(/[“”„]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/…/g, "...")
      .replace(/[•·]/g, "-")
      .replace(/ /g, " ")
      .replace(/\s/g, " ")
      .replace(/[^\x20-\x7E]/g, "");

  // Place a single AcroForm widget at an absolute box (used inside tables).
  const addFieldWidget = (fld, x, yTop, w, h) => {
    const name = fname(fld);
    const v = val(fld.idx);
    if (fld.kind === "check") {
      const cb = form.createCheckBox(name);
      cb.addToPage(page, { x, y: yTop - 13, width: 12, height: 12, borderWidth: 1 });
      if (v) cb.check();
    } else if (fld.kind === "area") {
      const tf = form.createTextField(name);
      tf.enableMultiline();
      tf.addToPage(page, { x, y: yTop - h, width: w, height: h, borderWidth: 1 });
      tf.setFontSize(11);
      if (v) tf.setText(enc(v));
    } else if (fld.kind === "select" && fld.options.length) {
      const dd = form.createDropdown(name);
      dd.addOptions(fld.options.map(enc));
      if (v && fld.options.includes(v)) dd.select(enc(v));
      dd.addToPage(page, { x, y: yTop - h, width: w, height: h, borderWidth: 1 });
      if (dd.setFontSize) dd.setFontSize(11);
    } else {
      const tf = form.createTextField(name);
      tf.addToPage(page, { x, y: yTop - h, width: w, height: h, borderWidth: 1 });
      tf.setFontSize(11);
      if (v) tf.setText(enc(v));
    }
  };

  const ensure = (space) => {
    if (y - space < M) {
      page = doc.addPage([PW, PH]);
      y = PH - M;
    }
  };
  // Wrap a single-font string into lines that fit a width.
  const wrapText = (text, f, size, maxW) => {
    const out = [];
    let line = "";
    for (const w of enc(text).split(/\s+/)) {
      const test = line ? line + " " + w : w;
      if (f.widthOfTextAtSize(test, size) > maxW && line) {
        out.push(line);
        line = w;
      } else line = test;
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };
  // Draw inline-formatted (bold/italic/code) runs with word wrapping.
  const drawRich = (runs, x0, size, gap) => {
    const maxW = PW - x0 - M;
    const words = [];
    for (const r of runs) {
      const f = pickFont(r);
      for (const part of enc(r.text).split(/(\s+)/)) {
        if (part === "") continue;
        words.push({ text: part, font: f, space: /^\s+$/.test(part) });
      }
    }
    let lineWords = [], lineW = 0;
    const flush = () => {
      ensure(size + gap);
      let x = x0;
      for (const w of lineWords) {
        if (!w.space) page.drawText(w.text, { x, y: y - size, size, font: w.font, color: ink });
        x += w.font.widthOfTextAtSize(w.text, size);
      }
      y -= size + gap;
      lineWords = [];
      lineW = 0;
    };
    for (const w of words) {
      const ww = w.font.widthOfTextAtSize(w.text, size);
      if (!w.space && lineW + ww > maxW && lineWords.length) flush();
      if (w.space && lineWords.length === 0) continue;
      lineWords.push(w);
      lineW += ww;
    }
    if (lineWords.length) flush();
  };
  const drawPara = (text, size = 11, x0) => drawRich(parseInline(text), x0 || M, size, 6);

  const drawTable = (rows) => {
    const cols = Math.max(...rows.map((r) => r.length));
    const colW = (PW - 2 * M) / cols;
    const size = 10, lh = size + 3, pad = 4;
    rows.forEach((row, ri) => {
      const f = ri === 0 ? bold : font;
      const measured = [];
      let maxH = lh;
      for (let c = 0; c < cols; c++) {
        const cell = row[c] || { text: "" };
        if (cell.field) {
          const h = cell.field.kind === "area" ? 40 : 18;
          measured.push({ cell, h });
          maxH = Math.max(maxH, h);
        } else {
          const lines = wrapText(stripInline(cell.text || ""), f, size, colW - 2 * pad);
          measured.push({ cell, lines });
          maxH = Math.max(maxH, lines.length * lh);
        }
      }
      const rowH = maxH + 2 * pad;
      ensure(rowH);
      const top = y;
      page.drawLine({ start: { x: M, y: top }, end: { x: PW - M, y: top }, thickness: 0.5, color: border });
      for (let c = 0; c < cols; c++) {
        const cx = M + c * colW;
        page.drawLine({ start: { x: cx, y: top }, end: { x: cx, y: top - rowH }, thickness: 0.5, color: border });
        const md = measured[c];
        if (md.cell.field) {
          addFieldWidget(md.cell.field, cx + pad, top - pad, colW - 2 * pad, md.h);
        } else {
          md.lines.forEach((ln, li) => {
            page.drawText(ln, { x: cx + pad, y: top - pad - size - li * lh, size, font: f, color: ink });
          });
        }
      }
      page.drawLine({ start: { x: PW - M, y: top }, end: { x: PW - M, y: top - rowH }, thickness: 0.5, color: border });
      page.drawLine({ start: { x: M, y: top - rowH }, end: { x: PW - M, y: top - rowH }, thickness: 0.5, color: border });
      y = top - rowH;
    });
    y -= 6;
  };

  const fname = (t) =>
    `${t.kind}_${t.idx}_${(t.label || "field").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30)}`;

  if (title && title.trim()) {
    drawRich([{ text: title.trim(), bold: true }], M, 18, 8);
    y -= 4;
  }

  for (const t of tokens) {
    if (t.type === "blank") { y -= 6; continue; }
    if (t.type === "heading") { drawRich(parseInline(t.text), M, t.level === 1 ? 16 : 14, 6); continue; }
    if (t.type === "text") { drawPara(t.text); continue; }
    if (t.type === "li") {
      ensure(11 + 6);
      page.drawText("-", { x: M, y: y - 11, size: 11, font, color: ink });
      drawPara(t.text, 11, M + 14);
      continue;
    }
    if (t.type === "hr") {
      ensure(12);
      y -= 4;
      page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.5, color: border });
      y -= 8;
      continue;
    }
    if (t.type === "table") { drawTable(t.rows); continue; }

    const size = 11;
    const v = val(t.idx);
    if (t.kind === "check") {
      ensure(20);
      const cb = form.createCheckBox(fname(t));
      cb.addToPage(page, { x: M, y: y - 14, width: 12, height: 12, borderWidth: 1 });
      if (v) cb.check();
      page.drawText(enc(t.label), { x: M + 20, y: y - 12, size, font, color: ink });
      y -= 22;
    } else if (t.kind === "area") {
      ensure(16);
      page.drawText(enc(t.label), { x: M, y: y - size, size, font: bold, color: ink });
      y -= size + 4;
      const h = 60;
      ensure(h + 6);
      const tf = form.createTextField(fname(t));
      tf.enableMultiline();
      tf.addToPage(page, { x: M, y: y - h, width: PW - 2 * M, height: h, borderWidth: 1 });
      tf.setFontSize(11);
      if (v) tf.setText(enc(v));
      y -= h + 8;
    } else if (t.kind === "select" && t.options.length) {
      ensure(24);
      const labelText = enc(t.label) + ":";
      const lw = font.widthOfTextAtSize(labelText, size);
      page.drawText(labelText, { x: M, y: y - 14, size, font, color: ink });
      const dd = form.createDropdown(fname(t));
      dd.addOptions(t.options.map(enc));
      if (v && t.options.includes(v)) dd.select(enc(v));
      const fx = M + lw + 8;
      dd.addToPage(page, { x: fx, y: y - 17, width: Math.max(120, PW - M - fx), height: 17, borderWidth: 1 });
      if (dd.setFontSize) dd.setFontSize(11);
      y -= 26;
    } else {
      // text / date / sign (or select with no options) → single-line text field
      ensure(24);
      const labelText = enc(t.label) + ":";
      const lw = font.widthOfTextAtSize(labelText, size);
      page.drawText(labelText, { x: M, y: y - 14, size, font, color: ink });
      const tf = form.createTextField(fname(t));
      const fx = M + lw + 8;
      tf.addToPage(page, { x: fx, y: y - 17, width: Math.max(120, PW - M - fx), height: 17, borderWidth: 1 });
      tf.setFontSize(11);
      if (v) tf.setText(enc(v));
      y -= 26;
    }
  }

  if (flatten) form.flatten();
  const bytes = await doc.save();
  return new Blob([bytes], { type: "application/pdf" });
}

// --- In-browser fill form ---
let fillTokens = [];
let fillTitle = "";
let fillContent = "";
let fillPublic = false;

function mdInline(text) {
  return window.DOMPurify.sanitize(window.marked.parseInline(text || ""));
}

// Create just the input element for a field (no label) — reused in rows and
// table cells.
function makeFieldInput(f) {
  if (f.kind === "check") {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.idx = f.idx;
    cb.dataset.kind = "check";
    return cb;
  }
  let input;
  if (f.kind === "area") {
    input = document.createElement("textarea");
    input.rows = 2;
  } else if (f.kind === "select" && f.options.length) {
    input = document.createElement("select");
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "— choose —";
    input.appendChild(blank);
    for (const o of f.options) {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;
      input.appendChild(opt);
    }
  } else {
    input = document.createElement("input");
    input.type = f.kind === "date" ? "date" : "text";
    if (f.kind === "sign") input.className = "fill-sign";
  }
  input.dataset.idx = f.idx;
  input.dataset.kind = f.kind;
  return input;
}

function renderFillForm(tokens, container) {
  container.innerHTML = "";
  let hasAny = false;
  for (const t of tokens) {
    if (t.type === "heading") {
      const h = document.createElement(t.level === 1 ? "h2" : "h3");
      h.innerHTML = mdInline(t.text);
      container.appendChild(h);
      continue;
    }
    if (t.type === "text") {
      const p = document.createElement("p");
      p.className = "fill-text";
      p.innerHTML = mdInline(t.text);
      container.appendChild(p);
      continue;
    }
    if (t.type === "li") {
      const p = document.createElement("p");
      p.className = "fill-text fill-li";
      p.innerHTML = "• " + mdInline(t.text);
      container.appendChild(p);
      continue;
    }
    if (t.type === "hr") {
      container.appendChild(document.createElement("hr"));
      continue;
    }
    if (t.type === "table") {
      const table = document.createElement("table");
      table.className = "fill-table";
      t.rows.forEach((row, ri) => {
        const tr = document.createElement("tr");
        row.forEach((cell) => {
          const td = document.createElement(ri === 0 ? "th" : "td");
          if (cell.field) {
            td.appendChild(makeFieldInput(cell.field));
            hasAny = true;
          } else {
            td.innerHTML = mdInline(cell.text);
          }
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      container.appendChild(table);
      continue;
    }
    if (t.type !== "field") continue;
    hasAny = true;

    const row = document.createElement("label");
    row.className = "fill-row";
    if (t.kind === "check") {
      const cb = makeFieldInput(t);
      row.append(cb, document.createTextNode(" " + t.label));
    } else {
      const span = document.createElement("span");
      span.className = "fill-label";
      span.textContent = t.label;
      row.appendChild(span);
      row.appendChild(makeFieldInput(t));
    }
    container.appendChild(row);
  }
  if (!hasAny) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "This note has no fillable fields.";
    container.appendChild(p);
  }
}

function collectValues(container) {
  const values = {};
  container.querySelectorAll("[data-idx]").forEach((el) => {
    const idx = Number(el.dataset.idx);
    values[idx] = el.dataset.kind === "check" ? el.checked : el.value;
  });
  return values;
}

function openFillView(title, content, publicMode) {
  fillTitle = title || "Form";
  fillContent = content || "";
  fillTokens = tokenizeForm(content);
  fillPublic = !!publicMode;
  fillTitleEl.textContent = fillTitle;
  fillBack.textContent = publicMode ? "← Make your own" : "← Back";
  renderFillForm(fillTokens, fillFormEl);
  showView(fillView);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Substitute entered values into the note and render it as HTML — used to
// print/save a beautiful filled document (same engine as the preview).
function buildFilledHtml(content, values) {
  const re = new RegExp(FIELD_RE.source, "gi");
  let i = 0;
  const filled = content.replace(re, (m, kind) => {
    const v = values[i++];
    const k = (kind || "").toLowerCase();
    if (k === "check") return v ? "☒" : "☐";
    const cls = k === "sign" ? "sig" : "ul";
    const inner =
      v == null || v === ""
        ? "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
        : escapeHtml(String(v));
    return `<span class="${cls}">${inner}</span>`;
  });
  return window.DOMPurify.sanitize(window.marked.parse(filled, { breaks: true }));
}

// Print, naming the saved file after the document's header (the browser uses
// document.title as the default PDF filename). Restore the title afterwards.
function printWithFilename(name) {
  const prev = document.title;
  if (name) document.title = name;
  const restore = () => {
    document.title = prev;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  setTimeout(restore, 60000); // safety net if afterprint never fires
  window.print();
}

// Render the filled doc with the browser (beautiful) and open Save-as-PDF.
fillPrintBtn.addEventListener("click", () => {
  const values = collectValues(fillFormEl);
  printArea.innerHTML = buildFilledHtml(fillContent, values);
  printWithFilename(docHeader(fillContent) || fillTitle);
});

fillBack.addEventListener("click", () => {
  if (fillPublic) location.href = location.pathname;
  else showView(appView);
});

fillDownloadBtn.addEventListener("click", async () => {
  if (!window.PDFLib) {
    alert("PDF library failed to load. Check your connection and reload.");
    return;
  }
  const values = collectValues(fillFormEl);
  fillDownloadBtn.disabled = true;
  const original = fillDownloadBtn.textContent;
  fillDownloadBtn.textContent = "Generating…";
  try {
    const blob = await buildPdf("", fillTokens, values, true);
    downloadBlob(
      safeName({ title: docHeader(fillContent) || fillTitle, content: "" }, "-filled.pdf"),
      blob
    );
  } catch (err) {
    alert("Couldn't generate the PDF: " + (err && err.message ? err.message : err));
  } finally {
    fillDownloadBtn.disabled = false;
    fillDownloadBtn.textContent = original;
  }
});

function openFormModal() {
  closeMenu();
  formMsg.textContent = "";
  formMsg.className = "msg";
  openModal(formModal);
}
formPdfBtn.addEventListener("click", openFormModal);
formClose.addEventListener("click", () => closeModal(formModal));

formInsert.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-snip]");
  if (!btn) return;
  insertAtCursor(btn.dataset.snip);
  closeModal(formModal);
});

function formGuard(n) {
  if (!n) return false;
  if (!window.PDFLib) {
    formMsg.textContent = "PDF library failed to load. Check your connection.";
    formMsg.className = "msg error";
    return false;
  }
  if (!hasFields(n.content || "")) {
    formMsg.textContent = "No field markers found — add e.g. [text: Name] first.";
    formMsg.className = "msg error";
    return false;
  }
  return true;
}

// Download a blank, interactive fillable PDF.
generatePdfBtn.addEventListener("click", async () => {
  const n = currentDoc();
  if (!formGuard(n)) return;
  generatePdfBtn.disabled = true;
  try {
    const blob = await buildPdf("", tokenizeForm(n.content), null, false);
    downloadBlob(safeName({ title: docHeader(n.content) || noteTitle(n), content: "" }, ".pdf"), blob);
    closeModal(formModal);
  } catch (err) {
    formMsg.textContent = "Couldn't generate PDF: " + (err.message || err);
    formMsg.className = "msg error";
  } finally {
    generatePdfBtn.disabled = false;
  }
});

// Fill the form in the browser, then download the completed PDF.
fillBrowserBtn.addEventListener("click", () => {
  const n = currentDoc();
  if (!formGuard(n)) return;
  closeModal(formModal);
  openFillView(noteTitle(n), n.content, false);
});

// Import .md/.txt files (button + drag-and-drop).
importBtn.addEventListener("click", () => {
  closeMenu();
  importInput.click();
});
importInput.addEventListener("change", () => {
  handleFiles(importInput.files);
  importInput.value = "";
});

async function handleFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => /text|markdown|\.md$|\.txt$/i.test(f.type + f.name));
  let lastId = null;
  for (const file of files) {
    const content = await file.text();
    const title = file.name.replace(/\.(md|markdown|txt)$/i, "");
    const { data, error } = await client
      .from("notes")
      .insert({ user_id: currentUser.id, title, content, updated_at: new Date().toISOString() })
      .select(COLS)
      .single();
    if (!error && data) {
      notes.unshift(data);
      lastId = data.id;
    }
  }
  if (lastId) {
    cacheNotes();
    sortNotes();
    renderList();
    openNote(lastId);
  }
}

["dragover", "dragenter"].forEach((ev) =>
  appView.addEventListener(ev, (e) => {
    if (guest) return;
    e.preventDefault();
    appView.classList.add("dragging");
  })
);
["dragleave", "drop"].forEach((ev) =>
  appView.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === "dragleave" && e.relatedTarget) return;
    appView.classList.remove("dragging");
  })
);
appView.addEventListener("drop", (e) => {
  if (guest) return;
  if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

// ---------------------------------------------------------------------------
// Share (public links)
// ---------------------------------------------------------------------------
function shareUrl(id) {
  return `${location.origin}${location.pathname}?share=${id}`;
}
function fillUrl(id) {
  return `${location.origin}${location.pathname}?fill=${id}`;
}
function updateShareUI() {
  const n = activeNote();
  const isPublic = !!(n && n.is_public);
  shareToggle.checked = isPublic;
  shareLinkRow.classList.toggle("hidden", !isPublic);
  if (isPublic && n) shareLinkEl.value = shareUrl(n.id);
  // Offer a form-fill link when the public note actually has fillable fields.
  const showFill = isPublic && n && hasFields(n.content || "");
  fillLinkBlock.classList.toggle("hidden", !showFill);
  if (showFill) fillLinkEl.value = fillUrl(n.id);
}
copyFillBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(fillLinkEl.value);
    copyFillBtn.textContent = "Copied!";
    setTimeout(() => (copyFillBtn.textContent = "Copy"), 1500);
  } catch (_) {
    fillLinkEl.select();
    document.execCommand("copy");
  }
});
shareBtn.addEventListener("click", () => {
  closeMenu();
  sharePanel.classList.toggle("hidden");
  updateShareUI();
});
shareToggle.addEventListener("change", async () => {
  const n = activeNote();
  if (!n) return;
  const makePublic = shareToggle.checked;
  const { error } = await client.from("notes").update({ is_public: makePublic }).eq("id", n.id);
  if (error) {
    shareToggle.checked = !makePublic;
    return setStatusError();
  }
  n.is_public = makePublic;
  cacheNotes();
  updateShareUI();
  renderList();
});
copyLinkBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareLinkEl.value);
    copyLinkBtn.textContent = "Copied!";
    setTimeout(() => (copyLinkBtn.textContent = "Copy"), 1500);
  } catch (_) {
    shareLinkEl.select();
    document.execCommand("copy");
  }
});

// ---------------------------------------------------------------------------
// Trash
// ---------------------------------------------------------------------------
function openModal(el) {
  el.classList.remove("hidden");
}
function closeModal(el) {
  el.classList.add("hidden");
}

async function openTrash() {
  closeMenu();
  openModal(trashModal);
  trashList.innerHTML = "<li class='muted'>Loading…</li>";
  const { data, error } = await client
    .from("notes")
    .select(COLS)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) {
    trashList.innerHTML = "<li class='muted'>Couldn't load trash.</li>";
    return;
  }
  trashData = data || [];
  renderTrash();
}

function renderTrash() {
  trashList.innerHTML = "";
  if (trashData.length === 0) {
    trashList.innerHTML = "<li class='muted'>Trash is empty.</li>";
    return;
  }
  for (const n of trashData) {
    const li = document.createElement("li");
    li.className = "trash-item";
    const label = document.createElement("span");
    label.className = "trash-title";
    label.textContent = noteTitle(n);
    const restore = document.createElement("button");
    restore.className = "link-btn";
    restore.textContent = "Restore";
    restore.addEventListener("click", () => restoreNote(n));
    const del = document.createElement("button");
    del.className = "link-btn danger";
    del.textContent = "Delete forever";
    del.addEventListener("click", () => deleteForever(n));
    li.append(label, restore, del);
    trashList.appendChild(li);
  }
}

async function restoreNote(n) {
  const { error } = await client.from("notes").update({ deleted_at: null }).eq("id", n.id);
  if (error) return;
  trashData = trashData.filter((x) => x.id !== n.id);
  n.deleted_at = null;
  notes.unshift(n);
  cacheNotes();
  sortNotes();
  renderTrash();
  renderList();
}

async function deleteForever(n) {
  if (!confirm(`Permanently delete "${noteTitle(n)}"? This can't be undone.`)) return;
  const { error } = await client.from("notes").delete().eq("id", n.id);
  if (error) return;
  trashData = trashData.filter((x) => x.id !== n.id);
  renderTrash();
}

emptyTrashBtn.addEventListener("click", async () => {
  if (!trashData.length) return;
  if (!confirm("Permanently delete all notes in trash? This can't be undone.")) return;
  const { error } = await client
    .from("notes")
    .delete()
    .not("deleted_at", "is", null)
    .eq("user_id", currentUser.id);
  if (error) return;
  trashData = [];
  renderTrash();
});

function purgeOldTrash() {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86400000).toISOString();
  client
    .from("notes")
    .delete()
    .lt("deleted_at", cutoff)
    .then(() => {});
}

trashBtn.addEventListener("click", openTrash);
trashClose.addEventListener("click", () => closeModal(trashModal));

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function setSettingsMsg(text, kind = "error") {
  settingsMsg.textContent = text;
  settingsMsg.className = "msg " + kind;
}

settingsBtn.addEventListener("click", () => {
  closeMenu();
  settingsEmail.textContent = currentUser ? currentUser.email : "";
  setSettingsMsg("");
  openModal(settingsModal);
});
settingsClose.addEventListener("click", () => closeModal(settingsModal));

emailForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = newEmailEl.value.trim();
  if (!email) return;
  const { error } = await client.auth.updateUser({ email });
  if (error) return setSettingsMsg(error.message);
  setSettingsMsg("Check both your old and new inbox to confirm the change.", "ok");
  newEmailEl.value = "";
});

passwordForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = settingsPasswordEl.value;
  if (pw.length < 6) return setSettingsMsg("Password must be at least 6 characters.");
  const { error } = await client.auth.updateUser({ password: pw });
  if (error) return setSettingsMsg(error.message);
  setSettingsMsg("Password updated.", "ok");
  settingsPasswordEl.value = "";
});

deleteAccountBtn.addEventListener("click", async () => {
  if (!confirm("Delete ALL your notes permanently and sign out? This can't be undone.")) return;
  const { error } = await client.from("notes").delete().eq("user_id", currentUser.id);
  if (error) return setSettingsMsg(error.message);
  await client.auth.signOut();
});

// ---------------------------------------------------------------------------
// Command palette
// ---------------------------------------------------------------------------
let paletteItems = [];
let paletteIndex = 0;

function paletteActions() {
  return [
    { label: "➕  New note", run: () => createNote() },
    { label: "🌗  Toggle dark mode", run: toggleTheme },
    { label: "📥  Import file(s)", run: () => importInput.click() },
    { label: "🗜  Export all (.zip)", run: () => exportZipBtn.click() },
    { label: "🖨  Print / PDF", run: () => printBtn.click() },
    { label: "📄  Fillable PDF", run: openFormModal },
    { label: "🗑  Open trash", run: openTrash },
    { label: "⚙️  Settings", run: () => settingsBtn.click() },
    { label: "🚪  Log out", run: () => logoutBtn.click() },
  ];
}

function renderPalette() {
  const q = paletteInput.value.trim().toLowerCase();
  const actions = paletteActions().filter((a) => a.label.toLowerCase().includes(q));
  const noteMatches = notes
    .filter((n) => matchesSearch(n, q))
    .slice(0, 8)
    .map((n) => ({ label: "📝  " + noteTitle(n), run: () => openNote(n.id) }));
  paletteItems = [...actions, ...noteMatches];
  if (paletteIndex >= paletteItems.length) paletteIndex = 0;

  paletteList.innerHTML = "";
  paletteItems.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "palette-item" + (i === paletteIndex ? " active" : "");
    li.textContent = item.label;
    li.addEventListener("click", () => runPalette(i));
    paletteList.appendChild(li);
  });
}

function openPalette() {
  if (guest || appView.classList.contains("hidden")) return;
  openModal(palette);
  paletteInput.value = "";
  paletteIndex = 0;
  renderPalette();
  paletteInput.focus();
}
function runPalette(i) {
  const item = paletteItems[i];
  closeModal(palette);
  if (item) item.run();
}
paletteInput.addEventListener("input", () => {
  paletteIndex = 0;
  renderPalette();
});
paletteInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    paletteIndex = Math.min(paletteIndex + 1, paletteItems.length - 1);
    renderPalette();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    paletteIndex = Math.max(paletteIndex - 1, 0);
    renderPalette();
  } else if (e.key === "Enter") {
    e.preventDefault();
    runPalette(paletteIndex);
  } else if (e.key === "Escape") {
    closeModal(palette);
  }
});

// Global shortcuts: Cmd/Ctrl+K palette, Escape closes overlays.
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (palette.classList.contains("hidden")) openPalette();
    else closeModal(palette);
  } else if (e.key === "Escape") {
    [palette, trashModal, settingsModal, formModal].forEach(closeModal);
  }
});
// Click on an overlay backdrop closes it.
[palette, trashModal, settingsModal, formModal].forEach((ov) =>
  ov.addEventListener("click", (e) => {
    if (e.target === ov) closeModal(ov);
  })
);

// ---------------------------------------------------------------------------
// Realtime (live sync across devices/tabs)
// ---------------------------------------------------------------------------
function subscribeRealtime() {
  if (realtimeChannel || !currentUser) return;
  realtimeChannel = client
    .channel("notes-" + currentUser.id)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notes", filter: `user_id=eq.${currentUser.id}` },
      (payload) => handleRealtime(payload)
    )
    .subscribe();
}

function handleRealtime(payload) {
  const row = payload.new || payload.old;
  if (!row) return;
  const id = row.id;
  const idx = notes.findIndex((n) => n.id === id);

  if (payload.eventType === "DELETE" || (payload.new && payload.new.deleted_at)) {
    if (idx !== -1) {
      notes.splice(idx, 1);
      if (activeId === id) {
        if (notes.length) openNote(notes[0].id);
        else createNote();
      }
    }
    cacheNotes();
    renderList();
    return;
  }

  // INSERT or UPDATE of an active (non-deleted) note.
  const fresh = payload.new;
  if (!fresh || fresh.deleted_at) return;
  if (idx === -1) {
    notes.unshift(fresh);
  } else {
    // Don't clobber unsaved local edits to the note we're editing.
    if (id === activeId && dirty) return;
    notes[idx] = fresh;
    if (id === activeId) {
      if (getEditorValue() !== (fresh.content || "")) setEditorValue(fresh.content || "");
      if (titleEl.value !== (fresh.title || "")) titleEl.value = fresh.title || "";
      updateCounts();
      renderTags();
      updatePinUI();
      updateShareUI();
    }
  }
  cacheNotes();
  sortNotes();
  renderList();
}

// ---------------------------------------------------------------------------
// Menu / sidebar UI
// ---------------------------------------------------------------------------
function closeMenu() {
  menuPop.classList.add("hidden");
}
moreBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  menuPop.classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  if (!menuPop.contains(e.target) && e.target !== moreBtn) closeMenu();
});

function openSidebar() {
  sidebar.classList.add("open");
  backdrop.classList.remove("hidden");
}
function closeSidebarMobile() {
  sidebar.classList.remove("open");
  backdrop.classList.add("hidden");
}
function toggleSidebar() {
  if (sidebar.classList.contains("open")) closeSidebarMobile();
  else openSidebar();
}
menuToggle.addEventListener("click", toggleSidebar);
backdrop.addEventListener("click", closeSidebarMobile);
fabNew.addEventListener("click", () => createNote());

let touchX = null;
let touchY = null;
let touchFromEdge = false;
document.addEventListener(
  "touchstart",
  (e) => {
    if (appView.classList.contains("hidden")) return;
    const t = e.changedTouches[0];
    touchX = t.clientX;
    touchY = t.clientY;
    touchFromEdge = t.clientX < 28;
  },
  { passive: true }
);
document.addEventListener(
  "touchend",
  (e) => {
    if (touchX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchX;
    const dy = t.clientY - touchY;
    touchX = touchY = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 45) return;
    const open = sidebar.classList.contains("open");
    if (dx > 0 && !open && touchFromEdge) openSidebar();
    else if (dx < 0 && open) closeSidebarMobile();
  },
  { passive: true }
);

// ---------------------------------------------------------------------------
// Public reader view (?share=<id>)
// ---------------------------------------------------------------------------
async function showReader(id) {
  showView(readerView);
  const { data, error } = await client
    .from("notes")
    .select("title, content, is_public")
    .eq("id", id)
    .maybeSingle();
  const titleNode = $("reader-title");
  const bodyNode = $("reader-body");
  if (error || !data || !data.is_public) {
    titleNode.textContent = "Not found";
    bodyNode.innerHTML = "<p>This note doesn't exist or is no longer shared.</p>";
    return;
  }
  document.title = (data.title || "Shared note") + " — Blank Page";
  titleNode.textContent = data.title || "Untitled";
  bodyNode.innerHTML = renderMarkdown(data.content);
}

// Public no-login fill page (?fill=<id>).
async function showFillPublic(id) {
  showView(fillView);
  fillBack.textContent = "← Make your own";
  fillPublic = true;
  fillTitleEl.textContent = "Loading…";
  fillFormEl.innerHTML = "";
  const { data, error } = await client
    .from("notes")
    .select("title, content, is_public")
    .eq("id", id)
    .maybeSingle();
  if (error || !data || !data.is_public) {
    fillTitleEl.textContent = "Not found";
    fillFormEl.innerHTML = "<p class='muted'>This form doesn't exist or is no longer shared.</p>";
    return;
  }
  document.title = (data.title || "Form") + " — Blank Page";
  openFillView(data.title || "Form", data.content, true);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function enterApp(user) {
  guest = false;
  localStorage.removeItem(GUEST_FLAG);
  appView.classList.remove("guest");
  guestBanner.classList.add("hidden");
  if (currentUser) return;
  currentUser = user;
  whoEl.textContent = user.email;
  showView(appView);
  initEditor();
  loadNotes();
}

function teardownRealtime() {
  if (realtimeChannel) {
    client.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

function enterAuth() {
  teardownRealtime();
  currentUser = null;
  guest = false;
  appView.classList.remove("guest");
  guestBanner.classList.add("hidden");
  notes = [];
  activeId = null;
  setMode("login");
  showView(authView);
  emailEl.focus();
}

function enterGuest() {
  guest = true;
  currentUser = null;
  localStorage.setItem(GUEST_FLAG, "1");
  appView.classList.add("guest");
  guestBanner.classList.remove("hidden");
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(GUEST_KEY)) || {};
  } catch (_) {
    saved = {};
  }
  showView(appView);
  initEditor();
  titleEl.value = saved.title || "";
  setEditorValue(saved.content || "");
  tagChips.innerHTML = "";
  updateCounts();
  statusEl.textContent = "Saved locally";
  if (editor) editor.focus();
}

function exitGuestToAuth() {
  guestSave();
  guest = false;
  localStorage.removeItem(GUEST_FLAG);
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(GUEST_KEY)) || {};
  } catch (_) {
    saved = {};
  }
  if ((saved.content || "").trim() || (saved.title || "").trim()) {
    localStorage.setItem(GUEST_IMPORT, "1");
  }
  appView.classList.remove("guest");
  guestBanner.classList.add("hidden");
  enterAuth();
}

async function maybeImportGuestNote() {
  if (!localStorage.getItem(GUEST_IMPORT)) return;
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(GUEST_KEY)) || {};
  } catch (_) {
    saved = {};
  }
  const hasText = (saved.content || "").trim() || (saved.title || "").trim();
  if (hasText && currentUser) {
    const { data, error } = await client
      .from("notes")
      .insert({
        user_id: currentUser.id,
        title: (saved.title || "").trim(),
        content: saved.content || "",
        updated_at: new Date().toISOString(),
      })
      .select(COLS)
      .single();
    if (!error && data) {
      notes.unshift(data);
      cacheNotes();
    }
  }
  localStorage.removeItem(GUEST_KEY);
  localStorage.removeItem(GUEST_IMPORT);
}

guestLink.addEventListener("click", (e) => {
  e.preventDefault();
  enterGuest();
});
guestSigninBtn.addEventListener("click", exitGuestToAuth);

function showRecovery() {
  recovering = true;
  recoveryMsg.textContent = "";
  recoveryMsg.className = "msg";
  showView(recoveryView);
  newPasswordEl.focus();
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

(function init() {
  initTheme();
  if (!configured) {
    showView(configError);
    return;
  }
  client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  registerServiceWorker();

  const params = new URLSearchParams(location.search);
  const shareId = params.get("share");
  if (shareId) {
    showReader(shareId);
    return;
  }

  const fillId = params.get("fill");
  if (fillId) {
    showFillPublic(fillId);
    return;
  }

  if (/type=recovery/.test(location.hash) || /type=recovery/.test(location.search)) {
    showRecovery();
  }

  client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      showRecovery();
      return;
    }
    if (recovering) return;
    if (session && session.user) {
      enterApp(session.user);
    } else if (localStorage.getItem(GUEST_FLAG)) {
      enterGuest();
    } else {
      enterAuth();
    }
  });
})();
