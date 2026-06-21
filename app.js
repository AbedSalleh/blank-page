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
const noteListEl = $("note-list");
const searchEl = $("search");
const newNoteBtn = $("new-note");
const whoEl = $("who");
const logoutBtn = $("logout");

const menuToggle = $("menu-toggle");
const titleEl = $("title");
const countsEl = $("counts");
const statusEl = $("status");
const pad = $("pad");
const preview = $("preview");
const togglePreviewBtn = $("toggle-preview");
const toggleThemeBtn = $("toggle-theme");
const moreBtn = $("more");
const menuPop = $("menu-pop");
const shareBtn = $("share-btn");
const exportMdBtn = $("export-md");
const exportTxtBtn = $("export-txt");
const deleteBtn = $("delete-btn");

const sharePanel = $("share-panel");
const shareToggle = $("share-toggle");
const shareLinkRow = $("share-link-row");
const shareLinkEl = $("share-link");
const copyLinkBtn = $("copy-link");

// ---------------------------------------------------------------------------
// Config / state
// ---------------------------------------------------------------------------
const cfg = window.BLANK_PAGE_CONFIG || {};
const configured =
  cfg.SUPABASE_URL &&
  cfg.SUPABASE_ANON_KEY &&
  cfg.SUPABASE_URL !== "YOUR_SUPABASE_URL" &&
  cfg.SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY";

const CACHE_KEY = "blankpage.notes.cache";
let client = null;
let currentUser = null;
let notes = [];
let activeId = null;
let mode = "login";
let previewOn = false;
let recovering = false;

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
  // The password field and "forgot" link are hidden in the reset-request mode.
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
    // forgot
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
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(stored || (prefersDark ? "dark" : "light"));
}

toggleThemeBtn.addEventListener("click", () => {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("blankpage.theme", next);
  applyTheme(next);
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
toggleLink.addEventListener("click", (e) => {
  e.preventDefault();
  // From any mode, this link returns to login; from login it goes to signup.
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
      // The link in the email returns the user here in PASSWORD_RECOVERY mode.
      const redirectTo = location.origin + location.pathname;
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
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

// Set-new-password form (shown after clicking the reset email link).
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
  } catch (_) {
    /* storage full / disabled — ignore */
  }
}

function loadCachedNotes() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || [];
  } catch (_) {
    return [];
  }
}

async function loadNotes() {
  const { data, error } = await client
    .from("notes")
    .select("id, title, content, is_public, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    // Offline / network error → fall back to cached copy (read-only-ish).
    notes = loadCachedNotes();
    statusEl.textContent = "Offline";
  } else {
    notes = data || [];
    cacheNotes();
  }

  if (notes.length === 0) {
    await createNote();
  } else {
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

function renderList() {
  const q = searchEl.value.trim().toLowerCase();
  const items = notes.filter((n) => {
    if (!q) return true;
    return (
      noteTitle(n).toLowerCase().includes(q) ||
      (n.content || "").toLowerCase().includes(q)
    );
  });

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
    t.textContent = noteTitle(n);
    const sub = document.createElement("div");
    sub.className = "note-sub";
    const snippet = (n.content || "").replace(/\s+/g, " ").trim().slice(0, 60);
    sub.textContent = snippet || "Empty";
    if (n.is_public) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "shared";
      t.appendChild(badge);
    }
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
  statusEl.textContent = "Saved";
  renderList();
}

async function createNote() {
  const draft = {
    user_id: currentUser.id,
    title: "Untitled",
    content: "",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from("notes")
    .insert(draft)
    .select("id, title, content, is_public, updated_at")
    .single();
  if (error) {
    setStatusError();
    return;
  }
  notes.unshift(data);
  cacheNotes();
  renderList();
  openNote(data.id);
  titleEl.focus();
}

newNoteBtn.addEventListener("click", () => {
  createNote();
  closeSidebarMobile();
});

deleteBtn.addEventListener("click", async () => {
  const n = activeNote();
  if (!n) return;
  if (!confirm(`Delete "${noteTitle(n)}"? This can't be undone.`)) return;
  closeMenu();
  const { error } = await client.from("notes").delete().eq("id", n.id);
  if (error) return setStatusError();
  notes = notes.filter((x) => x.id !== n.id);
  cacheNotes();
  if (notes.length === 0) {
    await createNote();
  } else {
    openNote(notes[0].id);
  }
});

// ---------------------------------------------------------------------------
// Editing + autosave
// ---------------------------------------------------------------------------
let saveTimer = null;
let saving = false;
let dirty = false;

function updateCounts() {
  const text = pad.value;
  const words = (text.trim().match(/\S+/g) || []).length;
  countsEl.textContent = `${words} word${words === 1 ? "" : "s"} · ${text.length} char${
    text.length === 1 ? "" : "s"
  }`;
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
  const { error } = await client
    .from("notes")
    .update({ title: n.title, content: n.content, updated_at: now })
    .eq("id", n.id);
  saving = false;
  if (error) {
    setStatusError();
    return;
  }
  n.updated_at = now;
  dirty = false;
  cacheNotes();
  statusEl.textContent = formatSavedTime(now);
  // Reflect title/snippet changes in the sidebar.
  const sub = document.querySelector(".note-item.active .note-sub");
  const title = document.querySelector(".note-item.active .note-title");
  if (title) title.childNodes[0] && (title.childNodes[0].textContent = noteTitle(n));
  if (sub) sub.textContent = (n.content || "").replace(/\s+/g, " ").trim().slice(0, 60) || "Empty";
}

// Flush pending edits immediately (used on logout / tab hide / unload).
async function flush() {
  clearTimeout(saveTimer);
  if (dirty) await save();
}

pad.addEventListener("input", onEdit);
titleEl.addEventListener("input", onEdit);

// Save when the tab is hidden (covers mobile app-switching & most closes).
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

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
searchEl.addEventListener("input", renderList);

// ---------------------------------------------------------------------------
// Preview toggle
// ---------------------------------------------------------------------------
togglePreviewBtn.addEventListener("click", () => {
  previewOn = !previewOn;
  preview.classList.toggle("hidden", !previewOn);
  pad.classList.toggle("split", previewOn);
  togglePreviewBtn.classList.toggle("on", previewOn);
  updatePreview();
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
function download(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
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

exportMdBtn.addEventListener("click", () => {
  const n = activeNote();
  if (n) download(safeName(n, ".md"), n.content || "");
  closeMenu();
});
exportTxtBtn.addEventListener("click", () => {
  const n = activeNote();
  if (n) download(safeName(n, ".txt"), n.content || "");
  closeMenu();
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
  const { error } = await client
    .from("notes")
    .update({ is_public: makePublic })
    .eq("id", n.id);
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

function closeSidebarMobile() {
  sidebar.classList.remove("open");
}
menuToggle.addEventListener("click", () => sidebar.classList.toggle("open"));

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
    bodyNode.innerHTML =
      "<p>This note doesn't exist or is no longer shared.</p>";
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
  if (currentUser) return; // already in
  currentUser = user;
  whoEl.textContent = user.email;
  showView(appView);
  loadNotes();
}

function enterAuth() {
  currentUser = null;
  notes = [];
  activeId = null;
  setMode("login");
  showView(authView);
  emailEl.focus();
}

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

  // A reset-email link returns here with type=recovery in the URL. Show the
  // set-password form right away so we never flash the editor in between.
  if (/type=recovery/.test(location.hash) || /type=recovery/.test(location.search)) {
    showRecovery();
  }

  client.auth.onAuthStateChange((event, session) => {
    // User clicked the reset link: let them set a new password before entering.
    if (event === "PASSWORD_RECOVERY") {
      showRecovery();
      return;
    }
    if (recovering) return; // stay on the set-password form until it's submitted
    if (session && session.user) {
      enterApp(session.user);
    } else {
      enterAuth();
    }
  });
})();
