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
const pad = $("pad");
const preview = $("preview");
const togglePreviewBtn = $("toggle-preview");
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

const toolbar = $("toolbar");
const tagbar = $("tagbar");
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
let previewOn = false;
let recovering = false;
let realtimeChannel = null;

// ---------------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------------
function showView(view) {
  [authView, appView, readerView, configError, recoveryView].forEach((v) =>
    v.classList.add("hidden")
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
// Theme
// ---------------------------------------------------------------------------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  toggleThemeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#1a1a1a" : "#fbfbf9";
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
  pad.value = n.content || "";
  updateCounts();
  updatePreview();
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
    statusEl.textContent = navigator.onLine ? "Save failed" : "Offline";
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
  if (error) return setStatusError();
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
  if (error) return setStatusError();
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
  const text = pad.value;
  const words = (text.trim().match(/\S+/g) || []).length;
  const label = `${words} word${words === 1 ? "" : "s"} · ${text.length} char${
    text.length === 1 ? "" : "s"
  }`;
  countsEl.textContent = label;
  menuCountsEl.textContent = label;
}

function updatePreview() {
  if (previewOn) preview.innerHTML = renderMarkdown(pad.value);
}

function setStatusError() {
  statusEl.textContent = "Save failed";
}

function formatSavedTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  return "Saved " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function onEdit() {
  if (guest) {
    updateCounts();
    updatePreview();
    statusEl.textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(guestSave, 400);
    return;
  }
  const n = activeNote();
  if (!n) return;
  n.title = titleEl.value;
  n.content = pad.value;
  dirty = true;
  updateCounts();
  updatePreview();
  statusEl.textContent = "Editing…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 700);
}

function guestSave() {
  try {
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify({ title: titleEl.value, content: pad.value })
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
    const { error } = await client.from("notes").update(q[id]).eq("id", id);
    if (!error) {
      delete q[id];
      const local = notes.find((x) => x.id === id);
      if (local) local.updated_at = q[id] ? q[id].updated_at : local.updated_at;
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

pad.addEventListener("input", onEdit);
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
// Formatting toolbar + keyboard shortcuts
// ---------------------------------------------------------------------------
function applyFormat(kind) {
  const start = pad.selectionStart;
  const end = pad.selectionEnd;
  const val = pad.value;
  const sel = val.slice(start, end);

  const wrap = (before, after, placeholder) => {
    const text = sel || placeholder;
    const out = before + text + after;
    pad.value = val.slice(0, start) + out + val.slice(end);
    const cursor = sel ? start + out.length : start + before.length;
    pad.setSelectionRange(cursor, sel ? cursor : cursor + text.length);
  };

  const linePrefix = (prefix) => {
    const lineStart = val.lastIndexOf("\n", start - 1) + 1;
    pad.value = val.slice(0, lineStart) + prefix + val.slice(lineStart);
    pad.setSelectionRange(start + prefix.length, end + prefix.length);
  };

  switch (kind) {
    case "bold": wrap("**", "**", "bold text"); break;
    case "italic": wrap("*", "*", "italic text"); break;
    case "code": wrap("`", "`", "code"); break;
    case "link": wrap("[", "](https://)", "text"); break;
    case "h1": linePrefix("# "); break;
    case "h2": linePrefix("## "); break;
    case "ul": linePrefix("- "); break;
    case "checklist": linePrefix("- [ ] "); break;
    case "quote": linePrefix("> "); break;
  }
  pad.focus();
  onEdit();
}

toolbar.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-fmt]");
  if (btn) applyFormat(btn.dataset.fmt);
});

pad.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const key = e.key.toLowerCase();
  if (key === "b") { e.preventDefault(); applyFormat("bold"); }
  else if (key === "i") { e.preventDefault(); applyFormat("italic"); }
  else if (key === "k") { e.preventDefault(); applyFormat("link"); }
  else if (key === "s") { e.preventDefault(); flush(); }
});

// ---------------------------------------------------------------------------
// Preview toggle
// ---------------------------------------------------------------------------
function togglePreview() {
  previewOn = !previewOn;
  preview.classList.toggle("hidden", !previewOn);
  pad.classList.toggle("split", previewOn);
  togglePreviewBtn.classList.toggle("on", previewOn);
  updatePreview();
}
togglePreviewBtn.addEventListener("click", togglePreview);

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
  return guest ? { title: titleEl.value, content: pad.value } : activeNote();
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
  const heading = noteTitle(n);
  printArea.innerHTML =
    "<h1>" + window.DOMPurify.sanitize(heading) + "</h1>" + renderMarkdown(n.content);
  window.print();
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
function updateShareUI() {
  const n = activeNote();
  const isPublic = !!(n && n.is_public);
  shareToggle.checked = isPublic;
  shareLinkRow.classList.toggle("hidden", !isPublic);
  if (isPublic && n) shareLinkEl.value = shareUrl(n.id);
}
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
    { label: "👁  Toggle preview", run: togglePreview },
    { label: "🌗  Toggle dark mode", run: toggleTheme },
    { label: "📥  Import file(s)", run: () => importInput.click() },
    { label: "🗜  Export all (.zip)", run: () => exportZipBtn.click() },
    { label: "🖨  Print / PDF", run: () => printBtn.click() },
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
    [palette, trashModal, settingsModal].forEach(closeModal);
  }
});
// Click on an overlay backdrop closes it.
[palette, trashModal, settingsModal].forEach((ov) =>
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
      if (pad.value !== (fresh.content || "")) pad.value = fresh.content || "";
      if (titleEl.value !== (fresh.title || "")) titleEl.value = fresh.title || "";
      updateCounts();
      updatePreview();
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
  titleEl.value = saved.title || "";
  pad.value = saved.content || "";
  tagChips.innerHTML = "";
  updateCounts();
  updatePreview();
  statusEl.textContent = "Saved locally";
  showView(appView);
  pad.focus();
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

  const shareId = new URLSearchParams(location.search).get("share");
  if (shareId) {
    showReader(shareId);
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
