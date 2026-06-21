# Blank Page

A dead-simple blank-slate page where you can write anything. It autosaves as you
type and is protected by an email/password login, so you can pick up your
writing from any device.

This is a **static site** (HTML/CSS/JS only) that uses
[Supabase](https://supabase.com) for authentication and cloud storage. That
means it can be hosted for free on **GitHub Pages** while still having real
login and cross-device sync — the notes live in Supabase's database, not in your
browser.

## How it works / where data is stored

- **Auth:** Supabase Auth handles email + password login (passwords are hashed
  and stored by Supabase, never by this page).
- **Storage:** Each user has one row in a `notes` table in your Supabase
  Postgres database. Row Level Security ensures a user can only read/write their
  own note.
- **Cross-device:** Because the data lives in Supabase, logging in on any device
  shows the same content.

## Setup

### 1. Create a Supabase project
- Go to https://supabase.com, sign in, and create a new project (free tier is
  fine). Wait for it to finish provisioning.

### 2. Create the database table
- In the Supabase dashboard: **SQL Editor → New query**, paste the contents of
  [`schema.sql`](./schema.sql), and click **Run**.

### 3. Add your project keys
- In the dashboard: **Project Settings → API**. Copy the **Project URL** and the
  **anon / public** key.
- Open [`config.js`](./config.js) and paste them in:
  ```js
  window.BLANK_PAGE_CONFIG = {
    SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
    SUPABASE_ANON_KEY: "your-anon-public-key",
  };
  ```
- The anon key is **public by design** — it is safe to commit and ship in the
  browser. Access is controlled by the Row Level Security policies in
  `schema.sql`, not by hiding this key. **Never** put the `service_role` key
  here.

### 4. (Optional) Email confirmation
- By default Supabase may require email confirmation on sign-up. If so, new
  users must click the link in their email before logging in. To allow instant
  login, disable it under **Authentication → Providers → Email → Confirm email**.

## Run locally

It's just static files, so any static server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy to GitHub Pages

1. Make sure `config.js` has your real Supabase URL and anon key committed.
2. In the repo: **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Select the **`main`** branch and the **`/ (root)`** folder, then **Save**.
5. Wait a minute; your site will be published at
   `https://<your-username>.github.io/blank-page/`.

### Important: allow your Pages URL in Supabase
- In Supabase: **Authentication → URL Configuration**, add your GitHub Pages URL
  (e.g. `https://<your-username>.github.io`) to the **Site URL** / **Redirect
  URLs** so auth works from that origin.

That's it — open the Pages URL, sign up, and your writing syncs across every
device you log in from.
