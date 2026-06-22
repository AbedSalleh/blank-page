# Blank Page

A simple, fast place to write anything. It autosaves as you type and syncs
across every device you log in from.

Blank Page is a **static site** (HTML/CSS/JS, no build step) backed by
[Supabase](https://supabase.com) for authentication and storage. That means it
runs for free on **GitHub Pages** while still having real accounts and
cross-device sync — your notes live in a database, not just one browser.

## Features

- ✍️ **Multiple notes** — create, rename, switch, and delete from a sidebar.
- 🔎 **Search** across note titles and contents.
- 💾 **Autosave** while you type, plus a save when you close or switch the tab.
- 📊 **Word & character count** and a last-saved time.
- 🌗 **Dark mode** — remembers your choice, respects your system setting.
- 👁 **Markdown preview** — write in Markdown, toggle a rendered view.
- 🔗 **Share links** — mark a note public and share a read-only link.
- 🔑 **Password reset** — emailed secure link to set a new password.
- 📤 **Export** a note as `.md` or `.txt`.
- 📱 **Installable PWA** — add to your home screen; loads offline.
- ⚡ **Guest mode** — skip the login and jot notes straight away; the scratchpad
  saves to that browser only (no account, no sync). Sign in later and it's
  imported into your account as a note.

## How it works

- **Auth:** Supabase Auth handles email + password. Passwords are hashed and
  stored by Supabase; this app never sees them.
- **Storage:** each note is a row in a Postgres `notes` table. Row Level
  Security restricts every user to their own notes — except notes they
  explicitly mark public, which anyone with the link can read.
- **Offline:** a service worker caches the app so it loads without a connection
  and shows your last-synced notes. Editing and syncing need a connection
  (Supabase is the source of truth); offline edits are **not** queued, so
  reconnect before relying on a save.

## Setup

### 1. Create a Supabase project
Sign in at [supabase.com](https://supabase.com) and create a project (the free
tier is plenty).

### 2. Create the database table
In the dashboard: **SQL Editor → New query**, then run **[`schema.sql`](./schema.sql)**.

> Upgrading an older single-note install? Run **[`migration.sql`](./migration.sql)**
> instead — it preserves existing data.

### 3. Add your project keys
In **Project Settings → API Keys**, copy the **Project URL** and the
**publishable** key (older dashboards call it **anon / public**), then put them
in [`config.js`](./config.js):

```js
window.BLANK_PAGE_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_xxx", // or the eyJ... anon key
};
```

This key is **public by design** and safe to commit — access is controlled by
Row Level Security, not by hiding it. Never put the `secret` / `service_role`
key here.

### 4. (Optional) Instant sign-up
Supabase may require email confirmation by default. To let users log in
immediately, disable it under **Authentication → Sign In / Providers → Email →
Confirm email**.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages

1. Commit `config.js` with your real values.
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch**.
3. Choose the **`main`** branch and the **`/ (root)`** folder, then **Save**.
4. The site publishes at `https://<your-username>.github.io/blank-page/`.
5. In Supabase, go to **Authentication → URL Configuration** and:
   - set **Site URL** to your Pages URL, and
   - add the Pages URL to **Redirect URLs** so password-reset links can return
     users to the app.

## Project structure

| File                          | Purpose                                         |
| ----------------------------- | ----------------------------------------------- |
| `index.html`                  | Markup for every view (auth, editor, reader).   |
| `app.js`                      | All app logic (auth, notes, sync, UI).          |
| `style.css`                   | Styles, theming, responsive/mobile layout.      |
| `config.js`                   | Your Supabase URL and publishable key.          |
| `schema.sql` / `migration.sql`| Database table and Row Level Security policies.  |
| `sw.js`, `manifest.json`, `icon.svg` | PWA: offline cache and install metadata.  |
| `robots.txt`, `sitemap.xml`, `og-image.svg` | SEO and social-preview assets.    |

## SEO

The landing page ships standard SEO: a descriptive title and meta description,
canonical URL, Open Graph + Twitter Card tags, JSON-LD `WebApplication`
structured data, a `<noscript>` fallback (the UI is JS-rendered), plus
`robots.txt` and `sitemap.xml`. After deploying, submit `sitemap.xml` in
[Google Search Console](https://search.google.com/search-console).

> **Social preview image:** `og-image.svg` is the share image, but most
> platforms (Facebook, LinkedIn, X) don't render SVG. For rich link previews,
> export it to a 1200×630 **PNG** and point `og:image` / `twitter:image` in
> `index.html` at the PNG.
