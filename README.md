# Blank Page

A dead-simple blank-slate page where you can write anything. It saves
automatically and is protected by a username/password login, so you can pick up
your writing from any device.

## Features

- One big blank textarea — just start typing.
- Autosaves to the server as you write (debounced).
- Username + password authentication (passwords hashed with bcrypt).
- Server-side sessions stored in SQLite, so you can log in from other devices
  and see the same content.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000, create an account, and start writing. Log in
with the same credentials from any other device pointed at the server.

## Configuration (environment variables)

| Variable         | Default      | Purpose                                              |
| ---------------- | ------------ | ---------------------------------------------------- |
| `PORT`           | `3000`       | Port to listen on.                                   |
| `SESSION_SECRET` | _ephemeral_  | Stable secret so logins survive restarts. Set this in production. |
| `DATA_DIR`       | `./data`     | Where the SQLite database and sessions are stored.   |
| `COOKIE_SECURE`  | `false`      | Set to `true` when serving over HTTPS.               |

Example:

```bash
SESSION_SECRET="$(openssl rand -hex 32)" COOKIE_SECURE=true npm start
```

## Notes on accessing from other devices

The app stores data and sessions on the server, so any device that can reach the
server URL and logs in with your credentials will see the same note. For access
beyond your local network, host it somewhere reachable and serve it over HTTPS
(set `COOKIE_SECURE=true`).
