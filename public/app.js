const authView = document.getElementById("auth");
const editorView = document.getElementById("editor");
const form = document.getElementById("auth-form");
const usernameEl = document.getElementById("username");
const passwordEl = document.getElementById("password");
const primaryBtn = document.getElementById("primary-btn");
const errorEl = document.getElementById("auth-error");
const toggleText = document.getElementById("toggle-text");
const toggleLink = document.getElementById("toggle-link");
const pad = document.getElementById("pad");
const statusEl = document.getElementById("status");
const whoEl = document.getElementById("who");
const logoutBtn = document.getElementById("logout");

let mode = "login"; // or "signup"

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { ok: res.ok, status: res.status, data };
}

function showAuth() {
  editorView.classList.add("hidden");
  authView.classList.remove("hidden");
  usernameEl.focus();
}

function showEditor(username) {
  authView.classList.add("hidden");
  editorView.classList.remove("hidden");
  whoEl.textContent = username;
  loadNote();
  pad.focus();
}

function setMode(next) {
  mode = next;
  errorEl.textContent = "";
  if (mode === "login") {
    primaryBtn.textContent = "Log in";
    toggleText.textContent = "Don't have an account?";
    toggleLink.textContent = "Sign up";
    passwordEl.autocomplete = "current-password";
  } else {
    primaryBtn.textContent = "Sign up";
    toggleText.textContent = "Already have an account?";
    toggleLink.textContent = "Log in";
    passwordEl.autocomplete = "new-password";
  }
}

toggleLink.addEventListener("click", (e) => {
  e.preventDefault();
  setMode(mode === "login" ? "signup" : "login");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  const username = usernameEl.value.trim();
  const password = passwordEl.value;
  const endpoint = mode === "login" ? "/api/login" : "/api/signup";
  const { ok, data } = await api(endpoint, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!ok) {
    errorEl.textContent = data.error || "Something went wrong.";
    return;
  }
  passwordEl.value = "";
  showEditor(data.username);
});

logoutBtn.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  pad.value = "";
  setMode("login");
  showAuth();
});

// --- Note loading / autosave ---
async function loadNote() {
  const { ok, data } = await api("/api/note");
  if (ok) {
    pad.value = data.content || "";
    statusEl.textContent = "Saved";
  }
}

let saveTimer = null;
let saving = false;

function scheduleSave() {
  statusEl.textContent = "Editing…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNote, 700);
}

async function saveNote() {
  if (saving) {
    scheduleSave();
    return;
  }
  saving = true;
  statusEl.textContent = "Saving…";
  const { ok, status } = await api("/api/note", {
    method: "PUT",
    body: JSON.stringify({ content: pad.value }),
  });
  saving = false;
  if (ok) {
    statusEl.textContent = "Saved";
  } else if (status === 401) {
    showAuth();
  } else {
    statusEl.textContent = "Save failed";
  }
}

pad.addEventListener("input", scheduleSave);
window.addEventListener("beforeunload", () => {
  if (statusEl.textContent !== "Saved") {
    navigator.sendBeacon &&
      navigator.sendBeacon(
        "/api/note",
        new Blob([JSON.stringify({ content: pad.value })], {
          type: "application/json",
        })
      );
  }
});

// --- Boot ---
(async function init() {
  setMode("login");
  const { ok, data } = await api("/api/me");
  if (ok) {
    showEditor(data.username);
  } else {
    showAuth();
  }
})();
