# Deployment (V3)

V3 is two containers behind the existing Cloudflare Tunnel: **web** (Caddy, serving the built app and scenario media on loopback `127.0.0.1:8230`, the port the `mbfdhub-gmktec` tunnel routes `firesim.mbfdhub.com` to) and **sync** (the live scene service, reachable only from Caddy on the compose network). Caddy proxies `/sync/*` (WebSocket), `/sync-api/*`, and `/media/*` to it. **No tunnel, DNS, or Cloudflare change is needed**; Cloudflare passes WebSockets through by default.

| | V2 | V3 |
| --- | --- | --- |
| Containers | web (Caddy), app (Fastify + Hocuspocus), db (PostgreSQL 18) | web (Caddy), sync (Node, `ws`) |
| Secrets | database password, signing secret, instructor PIN | none |
| Persistent server data | PostgreSQL volume, uploaded media | `live_scenes` volume: live scenes, automatic snapshots, uploaded media |
| Health | `/api/health` from Fastify | `/api/health` from Caddy (`"mode":"live"`), `/sync-api/health` from sync |

Checkout: `/opt/mbfd/mbfd-tactical-scene-simulator`. Compose project: `mbfd-tactical-scene-simulator`.

## Cutover from V2 (one time)

V2 data is not needed by V3, but it is preserved for rollback and records.

1. **Back up V2 first** (from the checkout, with V2 still running):
   ```bash
   install -d -m 700 backups
   docker compose exec -T db pg_dump -U firesim -d firesim -Fc > backups/firesim-v2-final-$(date +%Y%m%d-%H%M%S).dump
   tar -czf backups/firesim-v2-assets-$(date +%Y%m%d-%H%M%S).tgz data/assets
   curl -fsS http://127.0.0.1:8230/api/scenarios > backups/firesim-v2-scenarios-$(date +%Y%m%d-%H%M%S).json
   ls -l backups/
   ```
   Confirm the dump is non-empty (`pg_restore --list` works on it) before continuing.
2. Note the current V2 commit for rollback: `git rev-parse HEAD` (expected `de8a687…`).
3. Deploy V3:
   ```bash
   git fetch --prune origin
   git checkout main && git pull --ff-only origin main
   export APP_RELEASE=$(git rev-parse HEAD)
   docker compose build
   docker compose up -d --remove-orphans
   docker compose ps
   curl -fsS http://127.0.0.1:8230/api/health
   ```
   `--remove-orphans` stops the V2 `app` and `db` containers. It does **not** delete the `mbfd-tactical-scene-simulator_postgres_data` volume. Never run `docker compose down -v` here.
4. Verify through Cloudflare: `https://firesim.mbfdhub.com/` opens the Waterfront Estate board with no sign-in; `/api/health` reports the new release; apparatus art, background, and video load; an installed PWA updates on next launch (the service worker path `/sw.js` is unchanged, so V2 clients pick up V3 automatically).

## Upgrades

```bash
git pull --ff-only origin main
sed -i "s/^APP_RELEASE=.*/APP_RELEASE=$(git rev-parse HEAD)/" .env
docker compose build
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:8230/api/health
curl -fsS http://127.0.0.1:8230/sync-api/health
```

Restarting `sync` disconnects everyone for a moment; browsers reconnect on their own and keep their edits. The service saves every open scene (and snapshots it) when it receives SIGTERM, within the 20 s stop grace period.

There are no migrations: scenes without a `room.json` are treated as open shared scenes that never expire, exactly as before. Saved scenes are validated when loaded; scene schema changes must stay backward compatible or ship an in-app migration (damaged objects are salvaged individually).

## Live scene data

Live scenes are in the `mbfd-tactical-scene-simulator_live_scenes` volume (`/data` in the sync container):

```text
scenes/main/current.json          the original main scene (shared before rooms had owners; never expires)
scenes/main/history/*.json        automatic snapshots (newest 100)
scenes/<id>/current.json          a simulation (same layout for every scene)
scenes/<id>/room.json             who owns it: kind (solo or shared), SHA-256 of the host key, locked, status. Absent on scenes that predate rooms.
media/<uuid>.<ext>                uploaded maps and videos
```

Back it up with:

```bash
docker run --rm -v mbfd-tactical-scene-simulator_live_scenes:/data:ro -v "$PWD/backups:/out" busybox \
  tar -czf /out/live-scenes-$(date +%Y%m%d-%H%M%S).tgz -C /data .
```

Any snapshot can be restored for everyone from **Scenes → Saved versions** in the app (the current state is snapshotted first), or with `POST /sync-api/scenes/<id>/history/<name>/restore`.

## Rollback

- **To a previous V3 commit:** `git checkout --detach <sha>`, rebuild, `up -d`. Rolling back to the static release (before `sync` existed) leaves the `sync` container running until `docker compose up -d --remove-orphans`; the `live_scenes` volume is kept either way.
- **To V2:** `git checkout --detach de8a687`, restore the V2 `secrets/` files if they were removed, `docker compose build && docker compose up -d`. The V2 PostgreSQL volume is still present, so V2 resumes with its data. Restore from the dump only if the volume was lost.

## Hosting elsewhere

The web build (`apps/web/dist`) is static files, but shared scenes need the sync service on the same origin at `/sync`, `/sync-api`, and `/media` (see `Caddyfile`). Without it the app still opens and works, showing `Connecting…`, with edits kept only in that browser.

## Room lifecycle and limits

Rooms started from the start screen are created with `POST /sync-api/rooms` (the server picks the id and returns the host key once; only its hash is stored). Host actions are `POST /sync-api/rooms/<id>/{lock,unlock,end,reopen,share}` with the host key in the body. Saved versions of a private or locked simulation need the host key in an `X-Host-Key` header.

- A sweep runs every 10 minutes. Active rooms unused for 60 days (private) or 30 days (shared) become *ended*; ended rooms are deleted after 7 days. A host can reopen an ended room until then. Rooms with someone connected, and scenes without a `room.json`, are never touched. The sweep logs `Room lifecycle: ended N, deleted N`.
- Limits: 120 new rooms per hour per visitor address, 1000 scenes in total (new rooms get HTTP 503 beyond that), 40 connections per address and 150 people per room as before. A department-wide network address counts as one address.
- Host keys live in each browser's local storage. A host who clears site data loses host rights for that simulation (the data is untouched); the *continue on another device* owner link restores them. There is no server-side recovery of a lost host key.
- If a `room.json` cannot be read the room is refused (fail closed) instead of opening to everyone. Fix or restore the file from backup.
