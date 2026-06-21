const authView = document.getElementById("auth");
const editorView = document.getElementById("editor");
const configError = document.getElementById("config-error");
const form = document.getElementById("auth-form");
const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const primaryBtn = document.getElementById("primary-btn");
const msgEl = document.getElementById("auth-msg");
const toggleText = document.getElementById("toggle-text");
const toggleLink = document.getElementById("toggle-link");
const pad = document.getElementById("pad");
const statusEl = document.getElementById("status");
const whoEl = document.getElementById("who");
const logoutBtn = document.getElementById("logout");

const cfg = window.BLANK_PAGE_CONFIG || {};
const configured =
  cfg.SUPABASE_URL &&
  cfg.SUPABASE_ANON_KEY &&
  cfg.SUPABASE_URL !== "YOUR_SUPABASE_URL" &&
  cfg.SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY";

let mode = "login"; // or "signup"
let client = null;
let currentUser = null;

function showView(view) {
  authView.classList.add("hidden");
  editorView.classList.add("hidden");
  configError.classList.add("hidden");
  view.classList.remove("hidden");
}

function setMode(next) {
  mode = next;
  msgEl.textContent = "";
  msgEl.className = "msg";
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

function setMsg(text, kind = "error") {
  msgEl.textContent = text;
  msgEl.className = "msg " + kind;
}

toggleLink.addEventListener("click", (e) => {
  e.preventDefault();
  setMode(mode === "login" ? "signup" : "login");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("");
  const email = emailEl.value.trim();
  const password = passwordEl.value;
  primaryBtn.disabled = true;
  try {
    if (mode === "signup") {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) return setMsg(error.message);
      if (!data.session) {
        // Email confirmation is enabled on the project.
        setMsg("Account created. Check your email to confirm, then log in.", "ok");
        setMode("login");
        return;
      }
      // Session present → logged in immediately.
    } else {
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return setMsg(error.message);
    }
    passwordEl.value = "";
  } finally {
    primaryBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  await client.auth.signOut();
});

// --- Note loading / autosave ---
async function loadNote() {
  const { data, error } = await client
    .from("notes")
    .select("content")
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (error) {
    statusEl.textContent = "Load failed";
    return;
  }
  pad.value = (data && data.content) || "";
  statusEl.textContent = "Saved";
}

let saveTimer = null;
let saving = false;

function scheduleSave() {
  statusEl.textContent = "Editing…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNote, 700);
}

async function saveNote() {
  if (!currentUser) return;
  if (saving) {
    scheduleSave();
    return;
  }
  saving = true;
  statusEl.textContent = "Saving…";
  const { error } = await client.from("notes").upsert(
    {
      user_id: currentUser.id,
      content: pad.value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  saving = false;
  statusEl.textContent = error ? "Save failed" : "Saved";
}

pad.addEventListener("input", scheduleSave);

// --- Boot ---
function enterEditor(user) {
  currentUser = user;
  whoEl.textContent = user.email;
  showView(editorView);
  loadNote();
  pad.focus();
}

function enterAuth() {
  currentUser = null;
  pad.value = "";
  setMode("login");
  showView(authView);
  emailEl.focus();
}

(function init() {
  if (!configured) {
    showView(configError);
    return;
  }
  client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // Drives all view switching: fires on initial load, login, and logout.
  client.auth.onAuthStateChange((_event, session) => {
    if (session && session.user) {
      if (!currentUser) enterEditor(session.user);
    } else {
      enterAuth();
    }
  });
})();
