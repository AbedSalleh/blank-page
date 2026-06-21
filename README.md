# Blank Page

A simple, fast place to write anything — now with multiple notes, Markdown,
dark mode, search, sharing, and offline support. It autosaves as you type and
syncs across every device you log in from.

It's a **static site** (HTML/CSS/JS only) that uses
[Supabase](https://supabase.com) for authentication and cloud storage, so it
runs for free on **GitHub Pages** while still having real login and cross-device
sync — notes live in Supabase's database, not just your browser.

## Features

- ✍️ **Multiple notes** — create, rename, switch, and delete notes from a sidebar.
- 🔎 **Search** across all your notes (titles + contents).
- 💾 **Autosave** as you type, including a save when you close/switch the tab.
- 📊 **Word & character count** and a last-saved time.
- 🌗 **Dark mode** (remembers your choice, respects your system setting).
- 👁 **Markdown preview** — write in Markdown, toggle a rendered view.
- 🔗 **Share links** — make a note public and share a read-only link.
- 📤 **Export** any note as `.md` or `.txt`.
- 📱 **Installable PWA** — add to your home screen; the app shell works offline
  and shows your last-synced notes (editing/sync resumes when you're back online).

## How data is stored

- **Auth:** Supabase Auth handles email + password (Supabase hashes/stores
  passwords; this app never sees them).
- **Storage:** each note is a row in a Supabase Postgres `notes` table. Row Level
  Security ensures users only read/write their own notes — except notes they
  explicitly mark public, which anyone with the link can read.

## Setup

### 1. Create a Supabase project
Go to https://supabase.com and create a project (free tier is fine).

### 2. Create / update the database table
In the Supabase dashboard: **SQL Editor → New query**, then:
- **Fresh install:** paste and run [`schema.sql`](./schema.sql).
- **Upgrading from the original single-note version:** paste and run
  [`migration.sql`](./migration.sql) instead (it preserves your existing note).

### 3. Add your project keys
In **Project Settings → API Keys**, copy your **Project URL** and the
**publishable** key (older dashboards: the **anon / public** key). Put them in
[`config.js`](./config.js):
```js
window.BLANK_PAGE_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_xxx", // or the eyJ... anon key
};
```
This key is **public by design** and safe to commit — access is controlled by
the Row Level Security policies, not by hiding it. Never use the `secret` /
`service_role` key here.

### 4. (Optional) Instant sign-up
By default Supabase may require email confirmation. To let users log in
immediately, turn it off under **Authentication → Sign In / Providers → Email →
Confirm email**.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages

1. Commit `config.js` with your real values.
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch**.
3. Choose **`main`** branch, **`/ (root)`** folder, **Save**.
4. Site publishes at `https://<your-username>.github.io/blank-page/`.
5. In Supabase: **Authentication → URL Configuration**, set **Site URL** to your
   Pages URL so login works from that origin.

## Notes on offline use

The app shell is cached by a service worker, so the page loads without a
connection and shows your last-synced notes. Creating, editing, and syncing
notes still require a connection (Supabase is the source of truth); changes made
while offline are not queued, so reconnect before relying on a save.
