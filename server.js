import express from "express";
import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");

import fs from "node:fs";
fs.mkdirSync(DATA_DIR, { recursive: true });

// --- Database -------------------------------------------------------------
const db = new Database(path.join(DATA_DIR, "app.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notes (
    user_id INTEGER PRIMARY KEY,
    content TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// --- App ------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));

// A session secret keeps login cookies valid across devices. Provide a stable
// SESSION_SECRET via env in production so sessions survive restarts.
const sessionSecret =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.SESSION_SECRET) {
  console.warn(
    "[warn] SESSION_SECRET not set — using an ephemeral secret. " +
      "Logins will reset on restart. Set SESSION_SECRET to persist sessions."
  );
}

const SqliteStore = connectSqlite3(session);
app.use(
  session({
    store: new SqliteStore({ db: "sessions.db", dir: DATA_DIR }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
      secure: process.env.COOKIE_SECURE === "true",
    },
  })
);

// --- Helpers --------------------------------------------------------------
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: "Not authenticated" });
}

function validCredentials(username, password) {
  if (typeof username !== "string" || typeof password !== "string") return false;
  if (username.trim().length < 3 || username.length > 64) return false;
  if (password.length < 6 || password.length > 256) return false;
  return true;
}

// --- Auth routes ----------------------------------------------------------
app.post("/api/signup", (req, res) => {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";
  if (!validCredentials(username, password)) {
    return res.status(400).json({
      error:
        "Username must be 3-64 chars and password at least 6 chars.",
    });
  }
  const exists = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username);
  if (exists) {
    return res.status(409).json({ error: "Username already taken." });
  }
  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  const info = db
    .prepare(
      "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)"
    )
    .run(username, hash, now);
  db.prepare(
    "INSERT INTO notes (user_id, content, updated_at) VALUES (?, '', ?)"
  ).run(info.lastInsertRowid, now);
  req.session.userId = info.lastInsertRowid;
  req.session.username = username;
  res.json({ username });
});

app.post("/api/login", (req, res) => {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";
  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password." });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ username: user.username });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ username: req.session.username });
  }
  res.status(401).json({ error: "Not authenticated" });
});

// --- Note routes ----------------------------------------------------------
app.get("/api/note", requireAuth, (req, res) => {
  const row = db
    .prepare("SELECT content, updated_at FROM notes WHERE user_id = ?")
    .get(req.session.userId);
  res.json(row || { content: "", updated_at: null });
});

function saveNote(req, res) {
  const content = typeof req.body.content === "string" ? req.body.content : "";
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO notes (user_id, content, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).run(req.session.userId, content, now);
  res.json({ updated_at: now });
}

app.put("/api/note", requireAuth, saveNote);
// POST alias so navigator.sendBeacon (which always uses POST) can flush on unload.
app.post("/api/note", requireAuth, saveNote);

// --- Static + pages -------------------------------------------------------
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`blank-page running on http://localhost:${PORT}`);
});
